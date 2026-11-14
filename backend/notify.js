// Thông báo qua Telegram (tuỳ chọn): đặt TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID trong .env.
// Gửi nền, không bao giờ làm chậm hay làm hỏng việc đặt hàng.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';

const enabled = () => Boolean(TOKEN && CHAT);

async function send(text) {
  if (!enabled()) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: String(text).slice(0, 3500), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) console.error('Telegram lỗi:', r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error('Telegram không gửi được:', e.name, e.message);
  }
}
const fmt = n => Number(n).toLocaleString('vi-VN');

function orderText(o) {
  return [`🛒 Đơn mới ${o.code}`, `Khách: ${o.name} - ${o.phone}`, `Địa chỉ: ${o.address}`,
    ...o.items.map(i => `• ${i.name} x${i.qty} (${fmt(i.unitPrice)}đ)`),
    `Tổng: ${fmt(o.total)}đ`, o.note ? `Ghi chú: ${o.note}` : ''].filter(Boolean).join('\n');
}
function supportText(s) {
  return [`🛠 Yêu cầu hỗ trợ #${s.id}`, `Khách: ${s.name} - ${s.phone}`, s.product_id ? `Sản phẩm: ${s.product_id}` : '',
    `Triệu chứng: ${s.symptom}`].filter(Boolean).join('\n');
}

module.exports = { enabled, send, orderText, supportText };
