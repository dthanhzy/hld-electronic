// Xác thực nhân viên: mật khẩu băm bằng scrypt, phiên đăng nhập có hạn, khoá tạm khi nhập sai nhiều lần.
const crypto = require('crypto');
const db = require('./db');

const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const httpError = db.httpError;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}
const DUMMY = hashPassword('dummy-password-for-timing'); // để thời gian phản hồi giống nhau dù tên đăng nhập có tồn tại hay không

function checkUsername(u) {
  const v = String(u || '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(v)) throw httpError(400, 'Tên đăng nhập gồm 3-30 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  return v;
}
function checkPassword(p, username) {
  const v = String(p || '');
  if (v.length < 8 || v.length > 100) throw httpError(400, 'Mật khẩu phải từ 8 đến 100 ký tự.');
  if (username && v.toLowerCase() === String(username).toLowerCase()) throw httpError(400, 'Mật khẩu không được trùng tên đăng nhập.');
  return v;
}

function addStaff({ username, password, role }) {
  const u = checkUsername(username);
  const p = checkPassword(password, u);
  if (!['admin', 'staff'].includes(role)) throw httpError(400, 'Vai trò không hợp lệ.');
  const { salt, hash } = hashPassword(p);
  return db.createStaff({ username: u, salt, hash, role });
}

// Lần chạy đầu chưa có tài khoản nào: tạo quản trị viên từ .env (mật khẩu = ADMIN_PASSWORD, hoặc ADMIN_TOKEN nếu không đặt)
function bootstrap() {
  if (db.countStaff() > 0) return null;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || '';
  if (password.length < 8) return { created: false, reason: 'Chưa có tài khoản quản trị. Đặt ADMIN_PASSWORD (từ 8 ký tự) trong .env rồi chạy lại.' };
  addStaff({ username, password, role: 'admin' });
  db.addAudit(null, 'bootstrap', `Tạo tài khoản quản trị đầu tiên: ${username}`, '');
  return { created: true, username };
}

function login(username, password, ip) {
  const u = String(username || '').trim();
  const p = String(password || '');
  const row = u ? db.getStaffAuth(u) : null;
  if (row && row.locked_until && row.locked_until > new Date().toISOString()) {
    db.addAudit(row, 'login_locked', 'Đăng nhập khi tài khoản đang bị khoá', ip);
    throw httpError(429, `Tài khoản tạm khoá do nhập sai nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`);
  }
  const ok = row ? verifyPassword(p, row.pass_salt, row.pass_hash) : (verifyPassword(p, DUMMY.salt, DUMMY.hash), false);
  if (!ok || !row.active) {
    if (row) {
      const failed = row.failed + 1;
      if (failed >= MAX_FAILS) {
        db.setLoginFailure(row.id, 0, new Date(Date.now() + LOCK_MINUTES * 60000).toISOString());
        db.addAudit(row, 'account_locked', `Khoá ${LOCK_MINUTES} phút sau ${MAX_FAILS} lần sai`, ip);
      } else db.setLoginFailure(row.id, failed, null);
      db.addAudit(row, 'login_failed', row.active ? 'Sai mật khẩu' : 'Tài khoản đã bị vô hiệu', ip);
    } else db.addAudit(null, 'login_failed', `Tên đăng nhập không tồn tại: ${u.slice(0, 30)}`, ip);
    throw httpError(401, 'Sai tên đăng nhập hoặc mật khẩu.');
  }
  db.purgeExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  db.createSession(sha256(token), row.id, new Date(Date.now() + SESSION_HOURS * 3600000).toISOString());
  db.setLoginSuccess(row.id);
  db.addAudit(row, 'login', 'Đăng nhập thành công', ip);
  return { token, user: { id: row.id, username: row.username, role: row.role }, expiresInHours: SESSION_HOURS };
}

function authenticate(req, res, next) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Cần đăng nhập.' });
  const hash = sha256(token);
  const sess = db.getSession(hash);
  if (!sess || sess.expires_at < new Date().toISOString()) {
    if (sess) db.deleteSession(hash);
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.' });
  }
  const staff = db.getStaffById(sess.staff_id);
  if (!staff || !staff.active) return res.status(401).json({ error: 'Tài khoản đã bị vô hiệu.' });
  req.staff = staff; req.tokenHash = hash;
  next();
}
const requireAdmin = (req, res, next) =>
  req.staff && req.staff.role === 'admin' ? next() : res.status(403).json({ error: 'Chỉ quản trị viên mới dùng được chức năng này.' });

function changeOwnPassword(staff, tokenHash, current, next) {
  const row = db.getStaffAuth(staff.username);
  if (!verifyPassword(String(current || ''), row.pass_salt, row.pass_hash)) throw httpError(400, 'Mật khẩu hiện tại không đúng.');
  const p = checkPassword(next, staff.username);
  const { salt, hash } = hashPassword(p);
  db.updateStaff(staff.id, { salt, hash });
  db.deleteSessionsOf(staff.id, tokenHash); // đăng xuất các thiết bị khác
}

function updateStaff(actor, id, body) {
  const patch = {};
  const target = db.getStaffById(id);
  if (!target) throw httpError(404, 'Không tìm thấy nhân viên.');
  if (body.role !== undefined) {
    if (!['admin', 'staff'].includes(body.role)) throw httpError(400, 'Vai trò không hợp lệ.');
    patch.role = body.role;
  }
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.password) { const p = checkPassword(body.password, target.username); Object.assign(patch, hashPassword(p)); }
  if (body.unlock) patch.unlock = true;
  const demoting = (patch.role && patch.role !== 'admin') || patch.active === false;
  if (target.id === actor.id && demoting) throw httpError(400, 'Bạn không thể tự hạ quyền hoặc tự vô hiệu tài khoản của mình.');
  if (target.role === 'admin' && target.active && demoting && db.countActiveAdmins() <= 1) throw httpError(400, 'Phải còn ít nhất một quản trị viên đang hoạt động.');
  const out = db.updateStaff(id, patch);
  if (demoting || patch.hash) db.deleteSessionsOf(id); // đăng xuất ngay
  return out;
}

module.exports = { addStaff, bootstrap, login, authenticate, requireAdmin, changeOwnPassword, updateStaff, hashPassword, verifyPassword, checkPassword, SESSION_HOURS };
