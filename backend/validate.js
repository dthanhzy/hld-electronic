// Kiểm tra dữ liệu khách gửi lên. Lỗi ném ra có status 400 và thông báo tiếng Việt.
const bad = msg => Object.assign(new Error(msg), { status: 400 });

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Chấp nhận 0912345678, 0912 345 678, +84912345678, 84912345678 -> chuẩn hoá về 0912345678
function phone(v) {
  const raw = String(v ?? '').replace(/[\s.\-()]/g, '');
  const m = raw.match(/^(?:\+?84|0)(\d{9})$/);
  if (!m) throw bad('Số điện thoại không hợp lệ (cần 10 chữ số, ví dụ 0912345678).');
  return '0' + m[1];
}

function text(v, label, min, max) {
  const s = clean(v, max + 1);
  if (s.length < min) throw bad(`${label} quá ngắn (tối thiểu ${min} ký tự).`);
  if (s.length > max) throw bad(`${label} quá dài (tối đa ${max} ký tự).`);
  return s;
}

function order(body) {
  const b = body && typeof body === 'object' ? body : {};
  const customer = {
    name: text(b.name, 'Họ tên', 2, 80),
    phone: phone(b.phone),
    address: text(b.address, 'Địa chỉ', 8, 200),
    note: clean(b.note, 300)
  };
  if (!Array.isArray(b.items) || b.items.length === 0) throw bad('Giỏ hàng đang trống.');
  if (b.items.length > 20) throw bad('Giỏ hàng có quá nhiều sản phẩm.');

  const merged = new Map(); // gộp các dòng trùng sản phẩm
  for (const it of b.items) {
    const productId = typeof it?.productId === 'string' ? it.productId.trim() : '';
    const qty = Number(it?.qty);
    if (!productId) throw bad('Thiếu mã sản phẩm.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw bad('Số lượng mỗi sản phẩm phải từ 1 đến 20.');
    merged.set(productId, (merged.get(productId) || 0) + qty);
  }
  const items = [...merged].map(([productId, qty]) => ({ productId, qty }));
  if (items.some(i => i.qty > 20)) throw bad('Số lượng mỗi sản phẩm phải từ 1 đến 20.');
  return { customer, items };
}

function support(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    name: text(b.name, 'Họ tên', 2, 80),
    phone: phone(b.phone),
    symptom: text(b.symptom, 'Mô tả sự cố', 10, 1000),
    productId: clean(b.productId, 40) || null,
    faultId: clean(b.faultId, 40) || null,
    chatSummary: clean(b.chatSummary, 2000)
  };
}

module.exports = { order, support, phone, clean };
