require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { FAULTS } = require('./data');
const db = require('./db');
const validate = require('./validate');
const auth = require('./auth');
const notify = require('./notify');

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const DEMO_MODE = process.env.DEMO_MODE !== '0'; // 0 = đã dùng giá thật, ẩn thông báo demo
const WEB_SEARCH = process.env.AI_WEB_SEARCH !== '0'; // 0 = tắt tra cứu web
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // cần khi chạy sau proxy của Render/Railway

// Các header bảo mật cơ bản
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  });
  next();
});
app.use(express.json({ limit: '20kb' }));
app.use(cors({
  origin(origin, cb) {
    // Cho phép công cụ không có Origin (curl, Postman) và các origin trong danh sách
    if (!origin || ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error('Origin không được phép'));
  }
}));

/* ---------- Tiện ích ---------- */
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const fmt = n => n.toLocaleString('vi-VN');
const num = (v, d, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const limiter = (limit, windowMs, message) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });

function findFault(text) {
  const n = norm(text);
  return FAULTS.find(f => f.keywords.some(k => n.includes(k))) || null;
}
const publicFault = ({ keywords, ...rest }) => rest;

const REC_PURPOSES = ['karaoke', 'nhac', 'event', 'portable'];
const CAT_LABEL = { 'dan-karaoke': 'dàn karaoke', 'karaoke-di-dong': 'loa karaoke di động', 'xach-tay': 'loa xách tay' };

// Chọn loa theo diện tích, mục đích, bass, ngân sách. Điểm càng cao càng hợp.
function recommend({ purpose, area, budget, bass }) {
  let want = area <= 15 ? 1 : area <= 30 ? 2 : area <= 50 ? 3 : 4;
  if (bass === 'manh') want += 1;
  if (purpose === 'event') want = Math.max(want + 1, 3);
  if (purpose === 'portable') want = Math.min(want, 2);
  want = Math.min(4, want);
  const prefer = purpose === 'nhac' ? ['xach-tay', 'karaoke-di-dong']
    : purpose === 'portable' ? ['xach-tay']
    : purpose === 'event' ? ['dan-karaoke', 'karaoke-di-dong']
    : ['karaoke-di-dong', 'dan-karaoke'];
  const all = db.listProducts().filter(p => p.tier);
  const notes = [];
  const score = p => -Math.abs(p.tier - want) * 10
    + (prefer.includes(p.category) ? 5 - prefer.indexOf(p.category) * 2 : 0)
    - p.price / 1e6 * 0.1;
  const inStock = all.filter(p => p.inStock);
  if (!inStock.length) return { items: [], total: 0, withinBudget: false, why: [], notes: ['Hiện chưa có mẫu nào còn hàng.'] };
  let pool = budget > 0 ? inStock.filter(p => p.price <= budget) : inStock;
  let withinBudget = true;
  if (!pool.length) {
    withinBudget = false;
    pool = [...inStock].sort((a, b) => a.price - b.price).slice(0, 1);
    notes.push('Ngân sách hiện tại thấp hơn mẫu rẻ nhất đang có; mình gợi ý mẫu thấp giá nhất để bạn tham khảo.');
  }
  const main = [...pool].sort((a, b) => score(b) - score(a))[0];
  const items = [{ ...main, role: 'Phù hợp nhất', reason: reasonFor(main, { purpose, area, want, bass }) }];

  const up = inStock.filter(p => p.tier > main.tier && p.price > main.price).sort((a, b) => a.price - b.price)[0];
  if (up) items.push({ ...up, role: 'Nâng cấp', reason: `Mạnh hơn một bậc${budget > 0 && up.price > budget ? ' (vượt ngân sách một chút)' : ''}, hợp nếu bạn muốn dư công suất hoặc không gian lớn hơn.` });
  const down = inStock.filter(p => p.price < main.price && p.tier >= main.tier - 1 && p.id !== main.id).sort((a, b) => b.price - a.price)[0];
  if (down) items.push({ ...down, role: 'Tiết kiệm', reason: 'Rẻ hơn, vẫn dùng được cho nhu cầu cơ bản nếu bạn không cần hát quá lớn.' });

  const why = [`Diện tích ${area} m²${bass === 'manh' ? ', thích bass mạnh' : ''} nên mình ưu tiên nhóm công suất bậc ${want}/4.`];
  if (area > 60) notes.push(`Không gian lớn (${area} m²): nên hỏi kỹ thuật viên về độ phủ âm thực tế.`);
  notes.push('Mức công suất gợi ý là ước lượng của hệ thống dựa trên thông số poster, không phải cam kết độ phủ âm.');
  return { items, total: main.price, withinBudget, why, notes };
}
function reasonFor(p, { purpose, area, want, bass }) {
  const bits = [];
  if (p.bassCm) bits.push(`bass ${p.bassCm}cm${p.watt ? `, công suất ${p.watt[0] === p.watt[1] ? p.watt[0] : p.watt.join('-')}W` : ''}`);
  if (p.tier === want) bits.push(`vừa với không gian khoảng ${area} m²`);
  else if (p.tier < want) bits.push('hơi nhỏ so với nhu cầu nhưng vẫn nằm trong ngân sách');
  else bits.push('dư công suất, nghe thoải mái không phải mở hết cỡ');
  if (purpose === 'karaoke' || purpose === 'event') {
    const mic = p.specs['Micro'];
    if (mic) bits.push(`kèm ${mic}`);
  }
  if (bass === 'manh' && p.bassCm >= 30) bits.push('bass lớn hợp gu nghe mạnh');
  const t = `${CAT_LABEL[p.category] || 'loa'}: ${bits.join('; ')}.`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildSystemPrompt() {
  const catalog = db.listProducts().map(p => {
    const specs = Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join('; ');
    return `- ${p.name} (${fmt(p.price)}đ - giá demo, ${p.inStock ? 'còn hàng' : 'hết hàng'}): ${p.desc}${specs ? ` Thông số: ${specs}.` : ''}`;
  }).join('\n');
  return `Bạn là kỹ thuật viên kiêm tư vấn bán hàng của "HLD Electronic". Trả lời tiếng Việt, thân thiện, ngắn gọn, dùng tối đa 1-2 emoji.
Hai nhiệm vụ:
1) Tư vấn chọn/tuỳ chỉnh loa: hỏi khi thiếu thông tin (mục đích, diện tích phòng, ngân sách, mức bass), rồi đề xuất từ danh mục.
2) Chẩn đoán sự cố: hỏi triệu chứng cụ thể, nêu 2-3 nguyên nhân có thể xếp theo khả năng, cách tự kiểm tra an toàn, hướng khắc phục, và khi nào nên mang đi sửa. Luôn nhắc rút điện trước khi tháo loa; pin phồng/nóng/có mùi thì ngừng dùng ngay. Không khẳng định chắc chắn khi chưa kiểm tra trực tiếp.\nKhi chẩn đoán sự cố, hãy tra cứu các trang kỹ thuật sửa chữa loa/âm thanh uy tín trên web, tổng hợp lại thành giải pháp tối ưu theo thứ tự thử từ dễ đến khó, và nói rõ đâu là thông tin từ web. Không tra web khi khách chỉ hỏi về sản phẩm trong danh mục.
Danh mục sản phẩm (chỉ dùng đúng thông tin này):
${catalog}
Không bịa thông số kỹ thuật, bảo hành hay khuyến mãi không có ở trên; nếu thiếu dữ liệu, nói rõ và gợi ý liên hệ hotline 1900.123.456.`;
}

/* ---------- API công khai ---------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, ai: Boolean(GEMINI_KEY), admin: db.countStaff() > 0, demo: DEMO_MODE, notify: notify.enabled() }));

// Thông tin chuyển khoản (tuỳ chọn) để web hiện mã QR VietQR sau khi đặt hàng
app.get('/api/payment-info', (_req, res) => {
  const bank = process.env.BANK_CODE || '', accountNo = process.env.BANK_ACCOUNT || '', accountName = process.env.BANK_ACCOUNT_NAME || '';
  res.json(bank && accountNo ? { enabled: true, bank, accountNo, accountName } : { enabled: false });
});

app.get('/api/products', (_req, res) => res.json(db.listProducts()));

app.get('/api/products/:id', (req, res) => {
  const p = db.getProduct(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  res.json(p);
});

app.get('/api/faults', (_req, res) => res.json(FAULTS.map(({ id, label }) => ({ id, label }))));

app.get('/api/faults/:id', (req, res) => {
  const f = FAULTS.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'Không tìm thấy sự cố' });
  res.json(publicFault(f));
});

// Gợi ý cấu hình loa
app.post('/api/recommend', (req, res) => {
  const b = req.body || {};
  const purpose = REC_PURPOSES.includes(b.purpose) ? b.purpose : 'nhac';
  const bass = b.bass === 'manh' ? 'manh' : 'vua';
  const area = num(b.area, 20, 1, 1000);
  const budget = num(b.budgetMillion, 0, 0, 1000) * 1e6;
  res.json(recommend({ purpose, area, budget, bass }));
});

// Chẩn đoán theo mô tả (từ khoá, không tốn AI)
app.post('/api/diagnose', (req, res) => {
  const f = findFault(String(req.body?.text || '').slice(0, 500));
  res.json(f ? { matched: true, fault: publicFault(f) } : { matched: false });
});

/* ---------- Đặt hàng ---------- */
const writeLimiter = limiter(10, 10 * 60 * 1000, 'Bạn gửi quá nhiều yêu cầu, vui lòng thử lại sau ít phút.');
const lookupLimiter = limiter(20, 10 * 60 * 1000, 'Bạn tra cứu quá nhiều lần, vui lòng thử lại sau.');

app.post('/api/orders', writeLimiter, (req, res) => {
  const { customer, items } = validate.order(req.body);
  const order = db.createOrder(customer, items);
  notify.send(notify.orderText(order));
  res.status(201).json(publicOrder(order));
});

// Tra cứu cần cả mã đơn lẫn số điện thoại đặt hàng, để người lạ không dò được đơn của người khác
app.get('/api/orders/:code', lookupLimiter, (req, res) => {
  const o = db.getOrderByCode(String(req.params.code).toUpperCase());
  let phoneOk = false;
  try { phoneOk = o && validate.phone(req.query.phone) === o.phone; } catch { /* sai định dạng */ }
  if (!o || !phoneOk) return res.status(404).json({ error: 'Không tìm thấy đơn hàng với mã và số điện thoại này.' });
  res.json(publicOrder(o));
});

function publicOrder(o) {
  return { code: o.code, status: o.status, total: o.total, items: o.items, name: o.name, phone: o.phone,
           address: o.address, note: o.note, createdAt: o.created_at, updatedAt: o.updated_at };
}

/* ---------- Hỗ trợ / bảo hành ---------- */
app.post('/api/support', writeLimiter, (req, res) => {
  const s = db.createSupport(validate.support(req.body));
  notify.send(notify.supportText(s));
  res.status(201).json({ id: s.id, status: s.status, message: 'Đã nhận yêu cầu, kỹ thuật viên sẽ liên hệ bạn sớm.' });
});

/* ---------- Quản trị: đăng nhập nhân viên, phân quyền ---------- */
const ip = req => req.ip || '';
app.post('/api/admin/login', limiter(20, 15 * 60 * 1000, 'Đăng nhập quá nhiều lần, vui lòng thử lại sau.'), (req, res) => {
  res.json(auth.login(req.body?.username, req.body?.password, ip(req)));
});

const admin = express.Router();
admin.use(limiter(120, 60 * 1000, 'Quá nhiều yêu cầu.'), auth.authenticate);

admin.get('/me', (req, res) => res.json({ id: req.staff.id, username: req.staff.username, role: req.staff.role }));
admin.post('/logout', (req, res) => { db.deleteSession(req.tokenHash); db.addAudit(req.staff, 'logout', '', ip(req)); res.json({ ok: true }); });
admin.post('/password', (req, res) => {
  auth.changeOwnPassword(req.staff, req.tokenHash, req.body?.current, req.body?.next);
  db.addAudit(req.staff, 'password_change', 'Tự đổi mật khẩu', ip(req));
  res.json({ ok: true });
});

// Nhân viên và quản trị viên đều xử lý được đơn hàng, yêu cầu hỗ trợ, xem phản hồi
admin.get('/orders', (req, res) => res.json(db.listOrders(db.ORDER_STATUSES.includes(req.query.status) ? req.query.status : undefined)));
admin.patch('/orders/:code', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const o = db.setOrderStatus(code, req.body?.status);
  db.addAudit(req.staff, 'order_status', `${code} → ${o.status}`, ip(req));
  res.json(o);
});
admin.get('/support', (req, res) => res.json(db.listSupport(db.SUPPORT_STATUSES.includes(req.query.status) ? req.query.status : undefined)));
admin.patch('/support/:id', (req, res) => {
  const s = db.setSupportStatus(Number(req.params.id), req.body?.status);
  db.addAudit(req.staff, 'support_status', `#${s.id} → ${s.status}`, ip(req));
  res.json(s);
});
admin.get('/feedback', (_req, res) => res.json(db.listFeedback()));

// Chỉ quản trị viên: tồn kho, nhân viên, nhật ký
admin.patch('/products/:id', auth.requireAdmin, (req, res) => {
  const stock = Number(req.body?.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return res.status(400).json({ error: 'Tồn kho phải là số nguyên từ 0 trở lên.' });
  const p = db.setStock(req.params.id, stock);
  db.addAudit(req.staff, 'stock', `${p.id} → ${stock}`, ip(req));
  res.json(p);
});
admin.get('/staff', auth.requireAdmin, (_req, res) => res.json(db.listStaff()));
admin.post('/staff', auth.requireAdmin, (req, res) => {
  const s = auth.addStaff({ username: req.body?.username, password: req.body?.password, role: req.body?.role || 'staff' });
  db.addAudit(req.staff, 'staff_create', `${s.username} (${s.role})`, ip(req));
  res.status(201).json(s);
});
admin.patch('/staff/:id', auth.requireAdmin, (req, res) => {
  const s = auth.updateStaff(req.staff, Number(req.params.id), req.body || {});
  const what = ['role', 'active', 'password', 'unlock'].filter(k => req.body?.[k] !== undefined && req.body?.[k] !== false).join(', ');
  db.addAudit(req.staff, 'staff_update', `${s.username}: ${what}`, ip(req));
  res.json(s);
});
admin.get('/audit', auth.requireAdmin, (_req, res) => res.json(db.listAudit()));
app.use('/api/admin', admin);

/* ---------- Chat AI: key Gemini chỉ nằm ở server ---------- */
const chatLimiter = limiter(15, 60 * 1000, 'Bạn gửi quá nhanh, vui lòng thử lại sau ít phút.');

// Khách đánh giá câu trả lời của AI (giúp phát hiện câu trả lời kém)
app.post('/api/feedback', limiter(20, 10 * 60 * 1000, 'Bạn gửi quá nhiều phản hồi, vui lòng thử lại sau.'), (req, res) => {
  const b = req.body || {};
  if (typeof b.helpful !== 'boolean') return res.status(400).json({ error: 'Thiếu đánh giá.' });
  db.addFeedback({ helpful: b.helpful, question: String(b.question || '').slice(0, 500), answer: String(b.answer || '').slice(0, 1500) });
  res.json({ ok: true });
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  // Chỉ giữ role hợp lệ, cắt độ dài, lấy 12 tin gần nhất
  const messages = raw
    .filter(m => m && ['user', 'model'].includes(m.role) && typeof m.text === 'string' && m.text.trim())
    .map(m => ({ role: m.role, text: m.text.slice(0, 1000) }))
    .slice(-12);
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return res.status(400).json({ error: 'Tin nhắn cuối phải là của người dùng.' });

  // 1) Lỗi đã có sẵn trong cơ sở tri thức: trả lời luôn
  const f = findFault(last.text);
  if (f) return res.json({ source: 'local', fault: publicFault(f) });

  // 2) Còn lại hỏi AI
  if (!GEMINI_KEY) return res.status(503).json({ error: 'Server chưa cấu hình GEMINI_API_KEY.' });
  console.log('[chat] gửi tới Gemini, model =', MODEL);
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    contents: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.5, maxOutputTokens: 1500 }
  };
  const call = (withSearch) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify(withSearch ? { ...body, tools: [{ google_search: {} }] } : body),
    signal: AbortSignal.timeout(withSearch ? 90000 : 60000)
  });
  try {
    let searched = WEB_SEARCH;
    let r = await call(searched);
    let data = await r.json();
    if (!r.ok && searched) { // nếu tra web lỗi, thử lại không tra web
      console.error('Gemini (có tra web) lỗi, thử lại không tra web:', data.error?.message || r.status);
      searched = false;
      r = await call(false);
      data = await r.json();
    }
    if (!r.ok) {
      console.error('Gemini error:', data.error?.message || r.status);
      return res.status(502).json({ error: 'Dịch vụ AI đang lỗi, vui lòng thử lại sau.' });
    }
    const cand = data.candidates?.[0];
    const reply = (cand?.content?.parts || []).map(p => p.text || '').join('').trim();
    res.json({
      source: 'ai',
      reply: reply || 'Xin lỗi, mình chưa có phản hồi. Bạn thử diễn đạt lại nhé.',
      sources: searched ? extractSources(cand) : []
    });
  } catch (e) {
    console.error('Chat error:', e.name, e.message, e.cause ? String(e.cause) : '');
    const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    res.status(504).json({ error: timeout ? 'AI phản hồi quá lâu, vui lòng thử lại.' : 'Không kết nối được dịch vụ AI.' });
  }
});

// Lấy danh sách trang web mà Gemini đã dùng để trả lời (chỉ http/https, tối đa 6, bỏ trùng)
function extractSources(cand) {
  const out = [], seen = new Set();
  for (const c of cand?.groundingMetadata?.groundingChunks || []) {
    const uri = c?.web?.uri;
    if (typeof uri !== 'string' || !/^https?:\/\//i.test(uri) || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ title: String(c.web.title || uri).slice(0, 120), url: uri });
    if (out.length >= 6) break;
  }
  return out;
}

/* ---------- Xử lý lỗi ---------- */
app.use((_req, res) => res.status(404).json({ error: 'Không tìm thấy' }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn.' });
  const status = err.message === 'Origin không được phép' ? 403 : (err.status || 500);
  if (status === 500) console.error('Lỗi server:', err);
  res.status(status).json({ error: status === 500 ? 'Lỗi server' : err.message });
});

const boot = auth.bootstrap();
if (boot && boot.created) console.log(`Đã tạo tài khoản quản trị đầu tiên: "${boot.username}". Hãy đăng nhập rồi đổi mật khẩu.`);
if (boot && !boot.created) console.warn(boot.reason);

app.listen(PORT, () => console.log(
  `Backend chạy tại http://localhost:${PORT}  (AI: ${GEMINI_KEY ? 'bật' : 'chưa có key'}, quản trị: ${db.countStaff() > 0 ? 'bật' : 'chưa có tài khoản'}, Telegram: ${notify.enabled() ? 'bật' : 'tắt'})`));
