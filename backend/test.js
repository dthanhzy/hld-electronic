// Chạy: npm test   (dùng database tạm, không đụng dữ liệu thật)
const os = require('os');
const path = require('path');
const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'htl-'));
process.env.DB_FILE = path.join(tmp, 'test.db');

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('./db');
const v = require('./validate');

const throwsStatus = (fn, status, re) =>
  assert.throws(fn, e => e.status === status && (!re || re.test(e.message)));

const customer = { name: 'Nguyễn Văn A', phone: '0912345678', address: '12 Lê Lợi, Quận 1, TP.HCM', note: '' };

test('validate: số điện thoại', () => {
  assert.equal(v.phone('0912 345 678'), '0912345678');
  assert.equal(v.phone('+84912345678'), '0912345678');
  assert.equal(v.phone('84912345678'), '0912345678');
  throwsStatus(() => v.phone('12345'), 400);
  throwsStatus(() => v.phone('abc'), 400);
});

test('validate: đơn hàng', () => {
  const ok = v.order({ ...customer, items: [{ productId: 'hk1011', qty: 1 }, { productId: 'hk1011', qty: 2 }] });
  assert.deepEqual(ok.items, [{ productId: 'hk1011', qty: 3 }]); // gộp dòng trùng
  throwsStatus(() => v.order({ ...customer, items: [] }), 400, /trống/);
  throwsStatus(() => v.order({ ...customer, items: [{ productId: 'hk1011', qty: 0 }] }), 400);
  throwsStatus(() => v.order({ ...customer, items: [{ productId: 'hk1011', qty: 1.5 }] }), 400);
  throwsStatus(() => v.order({ ...customer, items: [{ productId: 'hk1011', qty: 99 }] }), 400);
  throwsStatus(() => v.order({ ...customer, name: 'A', items: [{ productId: 'hk1011', qty: 1 }] }), 400, /Họ tên/);
  throwsStatus(() => v.order(null), 400);
  // gộp xong vượt 20 thì vẫn bị chặn
  throwsStatus(() => v.order({ ...customer, items: [{ productId: 'hk1011', qty: 15 }, { productId: 'hk1011', qty: 15 }] }), 400);
});

test('validate: yêu cầu hỗ trợ', () => {
  const s = v.support({ name: 'Lan', phone: '0987654321', symptom: 'Loa kêu rè khi mở lớn' });
  assert.equal(s.phone, '0987654321');
  throwsStatus(() => v.support({ name: 'Lan', phone: '0987654321', symptom: 'rè' }), 400, /Mô tả/);
});

test('đặt hàng: giá do server tính, trừ tồn kho', () => {
  const before = db.getProduct('hk1011').stock;
  const o = db.createOrder(customer, [{ productId: 'hk1011', qty: 2 }, { productId: 'jhk1515', qty: 1 }]);
  assert.match(o.code, /^HLD-\d{8}-[A-Z2-9]{5}$/);
  assert.equal(o.total, 1890000 * 2 + 4590000);
  assert.equal(o.status, 'moi');
  assert.equal(o.items.length, 2);
  assert.equal(db.getProduct('hk1011').stock, before - 2);
});

test('đặt hàng: sản phẩm không tồn tại / vượt tồn kho thì không đổi gì', () => {
  const before = db.getProduct('jhk2566pro').stock;
  const orders = db.listOrders().length;
  throwsStatus(() => db.createOrder(customer, [{ productId: 'khong-co', qty: 1 }]), 400);
  throwsStatus(() => db.createOrder(customer, [{ productId: 'hk1011', qty: 1 }, { productId: 'jhk2566pro', qty: before + 1 }]), 409, /chỉ còn/);
  assert.equal(db.getProduct('jhk2566pro').stock, before);
  assert.equal(db.listOrders().length, orders);
  // đơn lỗi ở sản phẩm thứ 2 không được trừ tồn của sản phẩm thứ 1
  assert.equal(db.getProduct('hk1011').stock, 13);
});

test('hết hàng thì báo rõ', () => {
  db.setStock('jhk2566pro', 0);
  throwsStatus(() => db.createOrder(customer, [{ productId: 'jhk2566pro', qty: 1 }]), 409, /hết hàng/);
  db.setStock('jhk2566pro', 20);
});

test('trạng thái đơn: tiến lên, không lùi, huỷ thì hoàn kho', () => {
  const o = db.createOrder(customer, [{ productId: 'jhk1515', qty: 3 }]);
  const stock = db.getProduct('jhk1515').stock;
  assert.equal(db.setOrderStatus(o.code, 'da_xac_nhan').status, 'da_xac_nhan');
  assert.equal(db.setOrderStatus(o.code, 'dang_giao').status, 'dang_giao');
  throwsStatus(() => db.setOrderStatus(o.code, 'moi'), 409, /lùi/);
  throwsStatus(() => db.setOrderStatus(o.code, 'bay-ba'), 400);
  assert.equal(db.setOrderStatus(o.code, 'huy').status, 'huy');
  assert.equal(db.getProduct('jhk1515').stock, stock + 3); // hoàn kho
  throwsStatus(() => db.setOrderStatus(o.code, 'hoan_tat'), 409, /kết thúc/);
  throwsStatus(() => db.setOrderStatus('HLD-00000000-XXXXX', 'huy'), 404);
});

test('hai đơn cùng lúc không bán quá tồn kho', () => {
  db.setStock('jhk2566pro', 1);
  db.createOrder(customer, [{ productId: 'jhk2566pro', qty: 1 }]);
  throwsStatus(() => db.createOrder(customer, [{ productId: 'jhk2566pro', qty: 1 }]), 409);
  assert.equal(db.getProduct('jhk2566pro').stock, 0);
});

test('yêu cầu hỗ trợ: tạo, liệt kê, đổi trạng thái', () => {
  const s = db.createSupport(v.support({ name: 'Lan', phone: '0987654321', symptom: 'Loa kêu rè khi mở lớn', faultId: 'meo' }));
  assert.equal(s.status, 'moi');
  assert.equal(db.listSupport('moi').length, 1);
  assert.equal(db.setSupportStatus(s.id, 'dang_xu_ly').status, 'dang_xu_ly');
  throwsStatus(() => db.setSupportStatus(s.id, 'xyz'), 400);
  throwsStatus(() => db.setSupportStatus(9999, 'da_xong'), 404);
});

test('chống SQL injection qua dữ liệu khách nhập', () => {
  const evil = { ...customer, name: "Bob'); DROP TABLE orders;--" };
  db.setStock('hk1011', 20);
  const o = db.createOrder(evil, [{ productId: 'hk1011', qty: 1 }]);
  assert.equal(o.name, evil.name); // lưu nguyên văn như một chuỗi, không bị thực thi
  assert.ok(db.listOrders().length > 0);
});

test.after(() => {
  db.close(); // phải đóng database trước, nếu không Windows không cho xoá file
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* thư mục tạm, để hệ điều hành dọn */ }
});

test('phản hồi AI: lưu và liệt kê', () => {
  db.addFeedback({ helpful: false, question: 'loa rè', answer: 'thử đổi dây' });
  const l = db.listFeedback();
  assert.equal(l.length >= 1, true);
  assert.equal(l[0].helpful, 0);
});

/* ---------- Tài khoản nhân viên ---------- */
const auth = require('./auth');
const mockRes = () => { const r = { code: 200, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
const authCheck = token => { const res = mockRes(); let nextCalled = false; const req = { get: () => 'Bearer ' + token }; auth.authenticate(req, res, () => { nextCalled = true; }); return { res, req, nextCalled }; };

test('nhân viên: tạo tài khoản đầu tiên, kiểm tra mật khẩu', () => {
  process.env.ADMIN_PASSWORD = 'matkhau-manh-1';
  const b = auth.bootstrap();
  assert.equal(b.created, true);
  assert.equal(auth.bootstrap(), null); // đã có tài khoản thì không tạo lại
  throwsStatus(() => auth.addStaff({ username: 'ab', password: 'matkhau-manh-1', role: 'staff' }), 400); // tên quá ngắn
  throwsStatus(() => auth.addStaff({ username: 'lan', password: '123', role: 'staff' }), 400); // mật khẩu ngắn
  throwsStatus(() => auth.addStaff({ username: 'lan', password: 'lan', role: 'x' }), 400);
  throwsStatus(() => auth.addStaff({ username: 'admin', password: 'matkhau-khac-2', role: 'staff' }), 409); // trùng tên (không phân biệt hoa thường)
  throwsStatus(() => auth.addStaff({ username: 'ADMIN', password: 'matkhau-khac-2', role: 'staff' }), 409);
});

test('nhân viên: đăng nhập, phiên, đăng xuất', () => {
  throwsStatus(() => auth.login('admin', 'sai-mat-khau', '1.1.1.1'), 401);
  throwsStatus(() => auth.login('khong-ton-tai', 'abcdefgh', '1.1.1.1'), 401);
  const r = auth.login('admin', 'matkhau-manh-1', '1.1.1.1');
  assert.equal(r.user.role, 'admin');
  assert.equal(r.token.length, 64);
  const ok = authCheck(r.token);
  assert.equal(ok.nextCalled, true);
  assert.equal(ok.req.staff.username, 'admin');
  assert.equal(authCheck('token-gia').res.code, 401);
  assert.equal(authCheck('').res.code, 401);
  db.deleteSession(ok.req.tokenHash);
  assert.equal(authCheck(r.token).res.code, 401); // đã đăng xuất
  assert.ok(db.listAudit().some(a => a.action === 'login'));
  assert.ok(db.listAudit().some(a => a.action === 'login_failed'));
});

test('nhân viên: khoá tạm sau 5 lần sai, quản trị mở khoá', () => {
  const s = auth.addStaff({ username: 'lan', password: 'matkhau-lan-1', role: 'staff' });
  for (let i = 0; i < 5; i++) throwsStatus(() => auth.login('lan', 'sai-sai-sai', '2.2.2.2'), 401);
  throwsStatus(() => auth.login('lan', 'matkhau-lan-1', '2.2.2.2'), 429); // đúng mật khẩu vẫn bị khoá
  const admin = db.getStaffAuth('admin');
  auth.updateStaff(admin, s.id, { unlock: true });
  assert.equal(auth.login('lan', 'matkhau-lan-1', '2.2.2.2').user.username, 'lan');
  assert.ok(db.listAudit().some(a => a.action === 'account_locked'));
});

test('nhân viên: vô hiệu hoá, đổi mật khẩu, bảo vệ quản trị viên cuối', () => {
  const admin = db.getStaffAuth('admin');
  const lan = db.getStaffAuth('lan');
  const t = auth.login('lan', 'matkhau-lan-1', '3.3.3.3').token;
  auth.updateStaff(admin, lan.id, { active: false });
  assert.equal(authCheck(t).res.code, 401); // phiên cũ bị huỷ ngay
  throwsStatus(() => auth.login('lan', 'matkhau-lan-1', '3.3.3.3'), 401); // bị vô hiệu
  auth.updateStaff(admin, lan.id, { active: true, password: 'matkhau-lan-2' });
  const t2 = auth.login('lan', 'matkhau-lan-2', '3.3.3.3');
  const req = authCheck(t2.token).req;
  throwsStatus(() => auth.changeOwnPassword(req.staff, req.tokenHash, 'sai', 'matkhau-lan-3'), 400);
  auth.changeOwnPassword(req.staff, req.tokenHash, 'matkhau-lan-2', 'matkhau-lan-3');
  assert.equal(authCheck(t2.token).nextCalled, true); // phiên hiện tại vẫn còn
  assert.equal(auth.login('lan', 'matkhau-lan-3', '3.3.3.3').user.username, 'lan');
  throwsStatus(() => auth.updateStaff(admin, admin.id, { role: 'staff' }), 400); // không tự hạ quyền
  throwsStatus(() => auth.updateStaff(admin, admin.id, { active: false }), 400);
  throwsStatus(() => auth.updateStaff(lan, 9999, { active: false }), 404);
  // không để hệ thống không còn quản trị viên
  const b = auth.addStaff({ username: 'bao', password: 'matkhau-bao-1', role: 'admin' });
  auth.updateStaff(admin, b.id, { role: 'staff' }); // vẫn còn admin
  throwsStatus(() => auth.updateStaff(db.getStaffAuth('bao'), admin.id, { role: 'staff' }), 400); // bao giờ là staff nên không có quyền thật, nhưng tầng này chặn việc hạ admin cuối
});

test('nhân viên: danh sách không lộ mật khẩu', () => {
  for (const s of db.listStaff()) { assert.equal('pass_hash' in s, false); assert.equal('pass_salt' in s, false); }
});
