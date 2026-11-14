// Lưu trữ SQLite bằng module có sẵn của Node (node:sqlite), không cần cài thêm thư viện.
// Yêu cầu Node 22.5 trở lên.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PRODUCTS } = require('./data');

const FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'shop.db');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

const db = new DatabaseSync(FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'moi',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS support_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  product_id TEXT,
  fault_id TEXT,
  symptom TEXT NOT NULL,
  chat_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'moi',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  helpful INTEGER NOT NULL CHECK (helpful IN (0, 1)),
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  active INTEGER NOT NULL DEFAULT 1,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_requests(status);
`);

const ORDER_STATUSES = ['moi', 'da_xac_nhan', 'dang_giao', 'hoan_tat', 'huy'];
const SUPPORT_STATUSES = ['moi', 'dang_xu_ly', 'da_xong'];

const now = () => new Date().toISOString();
const httpError = (status, message) => Object.assign(new Error(message), { status });

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* ---------- Sản phẩm ---------- */
// Thêm sản phẩm mới vào bảng tồn kho; sản phẩm cũ giữ nguyên số tồn.
const insertStock = db.prepare('INSERT OR IGNORE INTO products (id, stock) VALUES (?, ?)');
for (const p of PRODUCTS) insertStock.run(p.id, p.stock ?? 0);

const stockOf = db.prepare('SELECT stock FROM products WHERE id = ?');

function present(p) {
  const row = stockOf.get(p.id);
  const stock = row ? row.stock : 0;
  return { id: p.id, model: p.model || null, name: p.name, price: p.price, desc: p.desc, category: p.category || null,
           specs: p.specs || {}, features: p.features || [], tier: p.tier || null, watt: p.watt || null,
           bassCm: p.bassCm || null, img: p.img || null, stock, inStock: stock > 0 };
}
const listProducts = () => PRODUCTS.map(present);
const getProduct = id => {
  const p = PRODUCTS.find(x => x.id === id);
  return p ? present(p) : null;
};
function setStock(id, stock) {
  if (!PRODUCTS.some(p => p.id === id)) throw httpError(404, 'Không tìm thấy sản phẩm');
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, id);
  return getProduct(id);
}

/* ---------- Đơn hàng ---------- */
function newOrderCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0/O, 1/I)
  let rnd = '';
  for (let i = 0; i < 5; i++) rnd += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `HLD-${ymd}-${rnd}`;
}

// customer: {name, phone, address, note}; items: [{productId, qty}] đã được kiểm tra hợp lệ
// Giá lấy từ server, không bao giờ tin giá do trình duyệt gửi.
function createOrder(customer, items) {
  return tx(() => {
    const lines = [];
    let total = 0;
    for (const it of items) {
      const p = getProduct(it.productId);
      if (!p) throw httpError(400, `Sản phẩm không tồn tại: ${it.productId}`);
      if (p.stock < it.qty) {
        throw httpError(409, p.stock === 0
          ? `${p.name} đã hết hàng.`
          : `${p.name} chỉ còn ${p.stock} sản phẩm.`);
      }
      lines.push({ product: p, qty: it.qty });
      total += p.price * it.qty;
    }

    const t = now();
    let code, orderId;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = newOrderCode();
      try {
        const r = db.prepare(`INSERT INTO orders (code, name, phone, address, note, total, status, created_at, updated_at)
                              VALUES (?, ?, ?, ?, ?, ?, 'moi', ?, ?)`)
          .run(code, customer.name, customer.phone, customer.address, customer.note || '', total, t, t);
        orderId = Number(r.lastInsertRowid);
        break;
      } catch (e) {
        if (!/UNIQUE/i.test(e.message) || attempt === 4) throw e; // trùng mã thì thử mã khác
      }
    }

    const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)');
    const dec = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const l of lines) {
      insItem.run(orderId, l.product.id, l.product.name, l.product.price, l.qty);
      const r = dec.run(l.qty, l.product.id, l.qty);
      if (r.changes !== 1) throw httpError(409, `${l.product.name} vừa hết hàng, vui lòng thử lại.`);
    }
    return getOrderByCode(code);
  });
}

function getOrderByCode(code) {
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(code);
  if (!o) return null;
  o.items = db.prepare('SELECT product_id AS productId, product_name AS name, unit_price AS unitPrice, qty FROM order_items WHERE order_id = ?').all(o.id);
  return o;
}

function listOrders(status) {
  const rows = status
    ? db.prepare('SELECT code FROM orders WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT code FROM orders ORDER BY id DESC LIMIT 200').all();
  return rows.map(r => getOrderByCode(r.code));
}

// Chỉ cho phép đi tới: huỷ, hoặc tiến lên trạng thái sau. Đơn đã huỷ/hoàn tất là kết thúc.
function setOrderStatus(code, status) {
  if (!ORDER_STATUSES.includes(status)) throw httpError(400, 'Trạng thái không hợp lệ');
  return tx(() => {
    const o = getOrderByCode(code);
    if (!o) throw httpError(404, 'Không tìm thấy đơn hàng');
    if (o.status === status) return o;
    if (o.status === 'huy' || o.status === 'hoan_tat') throw httpError(409, 'Đơn đã kết thúc, không đổi trạng thái được.');
    if (status !== 'huy' && ORDER_STATUSES.indexOf(status) < ORDER_STATUSES.indexOf(o.status)) {
      throw httpError(409, 'Không thể lùi trạng thái đơn hàng.');
    }
    if (status === 'huy') { // hoàn lại tồn kho
      const back = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const it of o.items) back.run(it.qty, it.productId);
    }
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE code = ?').run(status, now(), code);
    return getOrderByCode(code);
  });
}

/* ---------- Yêu cầu hỗ trợ / bảo hành ---------- */
function createSupport(s) {
  const t = now();
  const r = db.prepare(`INSERT INTO support_requests (name, phone, product_id, fault_id, symptom, chat_summary, status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, 'moi', ?, ?)`)
    .run(s.name, s.phone, s.productId || null, s.faultId || null, s.symptom, s.chatSummary || '', t, t);
  return getSupport(Number(r.lastInsertRowid));
}
const getSupport = id => db.prepare('SELECT * FROM support_requests WHERE id = ?').get(id) || null;
function listSupport(status) {
  return status
    ? db.prepare('SELECT * FROM support_requests WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM support_requests ORDER BY id DESC LIMIT 200').all();
}
function setSupportStatus(id, status) {
  if (!SUPPORT_STATUSES.includes(status)) throw httpError(400, 'Trạng thái không hợp lệ');
  const r = db.prepare('UPDATE support_requests SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  if (r.changes === 0) throw httpError(404, 'Không tìm thấy yêu cầu');
  return getSupport(id);
}

/* ---------- Nhân viên, phiên đăng nhập, nhật ký ---------- */
const STAFF_COLS = 'id, username, role, active, failed, locked_until, last_login, created_at';
const countStaff = () => db.prepare('SELECT COUNT(*) AS n FROM staff').get().n;
function createStaff({ username, salt, hash, role }) {
  try {
    const r = db.prepare('INSERT INTO staff (username, pass_salt, pass_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(username, salt, hash, role, now());
    return getStaffById(Number(r.lastInsertRowid));
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) throw httpError(409, 'Tên đăng nhập đã tồn tại.');
    throw e;
  }
}
const getStaffById = id => db.prepare(`SELECT ${STAFF_COLS} FROM staff WHERE id = ?`).get(id) || null;
const getStaffAuth = username => db.prepare('SELECT * FROM staff WHERE username = ?').get(username) || null; // có cả hash
const listStaff = () => db.prepare(`SELECT ${STAFF_COLS} FROM staff ORDER BY id`).all();
const countActiveAdmins = () => db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = 'admin' AND active = 1").get().n;
function updateStaff(id, f) {
  const cur = getStaffById(id);
  if (!cur) throw httpError(404, 'Không tìm thấy nhân viên.');
  const role = f.role ?? cur.role, active = f.active === undefined ? cur.active : (f.active ? 1 : 0);
  db.prepare('UPDATE staff SET role = ?, active = ? WHERE id = ?').run(role, active, id);
  if (f.hash) db.prepare('UPDATE staff SET pass_salt = ?, pass_hash = ?, failed = 0, locked_until = NULL WHERE id = ?').run(f.salt, f.hash, id);
  if (f.unlock) db.prepare('UPDATE staff SET failed = 0, locked_until = NULL WHERE id = ?').run(id);
  return getStaffById(id);
}
const setLoginFailure = (id, failed, lockedUntil) => db.prepare('UPDATE staff SET failed = ?, locked_until = ? WHERE id = ?').run(failed, lockedUntil, id);
const setLoginSuccess = id => db.prepare('UPDATE staff SET failed = 0, locked_until = NULL, last_login = ? WHERE id = ?').run(now(), id);
const createSession = (tokenHash, staffId, expiresAt) =>
  db.prepare('INSERT INTO sessions (token_hash, staff_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(tokenHash, staffId, expiresAt, now());
const getSession = tokenHash => db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) || null;
const deleteSession = tokenHash => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
const deleteSessionsOf = (staffId, exceptHash) =>
  db.prepare('DELETE FROM sessions WHERE staff_id = ? AND token_hash != ?').run(staffId, exceptHash || '');
const purgeExpiredSessions = () => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
function addAudit(staff, action, detail, ip) {
  db.prepare('INSERT INTO audit_log (staff_id, username, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(staff ? staff.id : null, staff ? staff.username : '', action, String(detail || '').slice(0, 300), String(ip || '').slice(0, 60), now());
}
const listAudit = () => db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all();

/* ---------- Phản hồi về câu trả lời của AI ---------- */
function addFeedback({ helpful, question, answer }) {
  const r = db.prepare('INSERT INTO feedback (helpful, question, answer, created_at) VALUES (?, ?, ?, ?)')
    .run(helpful ? 1 : 0, question || '', answer || '', now());
  return { id: Number(r.lastInsertRowid) };
}
const listFeedback = () => db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 200').all();

const close = () => db.close();

module.exports = {
  close, ORDER_STATUSES, SUPPORT_STATUSES, httpError,
  listProducts, getProduct, setStock,
  createOrder, getOrderByCode, listOrders, setOrderStatus,
  createSupport, getSupport, listSupport, setSupportStatus,
  addFeedback, listFeedback,
  countStaff, createStaff, getStaffById, getStaffAuth, listStaff, countActiveAdmins, updateStaff,
  setLoginFailure, setLoginSuccess, createSession, getSession, deleteSession, deleteSessionsOf, purgeExpiredSessions,
  addAudit, listAudit
};
