// Sao lưu cơ sở dữ liệu: npm run backup
// Tạo file backups/shop-YYYYMMDD-HHMM.db (bản sao nhất quán, an toàn khi server đang chạy) và giữ 10 bản mới nhất.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SRC = process.env.DB_FILE || path.join(__dirname, 'data', 'shop.db');
if (!fs.existsSync(SRC)) { console.error('Chưa có dữ liệu để sao lưu:', SRC); process.exit(1); }
const dir = path.join(__dirname, 'backups');
fs.mkdirSync(dir, { recursive: true });
const d = new Date(), p = n => String(n).padStart(2, '0');
const name = `shop-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.db`;
const out = path.join(dir, name);
const db = new DatabaseSync(SRC);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
const files = fs.readdirSync(dir).filter(f => /^shop-.*\.db$/.test(f)).sort();
for (const f of files.slice(0, Math.max(0, files.length - 10))) fs.unlinkSync(path.join(dir, f));
console.log('Đã sao lưu:', out);
