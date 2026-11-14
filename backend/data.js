// Dữ liệu sản phẩm và cơ sở tri thức sự cố. Sau này có thể chuyển sang database.

/* ============================================================================
   DANH MỤC SẢN PHẨM
   - Nguồn: 13 poster giới thiệu trong thư mục Drive "thong tin loa".
   - Chỉ ghi thông số ĐỌC RÕ trên poster. Chỗ chữ nhoè/không chắc thì để trống
     và ghi chú "XÁC NHẬN" bên dưới; bạn đối chiếu ảnh rồi điền vào specs.
   - price: GIÁ DEMO do hệ thống tự đặt (poster không có giá). Hãy thay bằng giá thật.
   - stock: số ban đầu (demo). Sau khi có đơn, tồn kho do SQLite quản lý.
   - tier (1 nhỏ ... 4 lớn): ước lượng của hệ thống để gợi ý theo diện tích phòng,
     dựa vào cỡ bass và công suất ghi trên poster. Không phải thông số nhà sản xuất.
   - watt: [thấp nhất, cao nhất] theo nhà sản xuất, null nếu không đọc được.
   - img: đặt ảnh poster vào thư mục images/ cạnh index.html, tên <id>.jpg
   ============================================================================ */
const CATEGORIES = {
  'dan-karaoke': 'Dàn karaoke',
  'karaoke-di-dong': 'Loa karaoke di động',
  'xach-tay': 'Loa xách tay'
};

const PRODUCTS = [
  // ---- Dàn karaoke ----
  { id: 'ja9500d', model: 'JA-9500D', name: 'Dàn karaoke di động JA-9500D', category: 'dan-karaoke',
    price: 15900000, stock: 15, tier: 4, watt: [2000, 2000], bassCm: 40, bassCount: 2,
    desc: 'Dàn karaoke di động trọn bộ công suất 2000W, bass 40cm x 2, kèm main công suất TD-6002, vang cơ FX-999S và micro JA-889.',
    specs: { 'Công suất': '2000W', 'Loa bass': '40cm x 2', 'Main công suất': 'TD-6002', 'Vang cơ': 'FX-999S', 'Micro': 'JA-889', 'Bluetooth': '5.0', 'Ngõ kết nối': 'Bluetooth, USB, Optical' },
    features: ['Trọn bộ: loa, main, vang cơ và micro', 'Phù hợp gia đình, tiệc tùng, sự kiện'],
    img: 'images/ja9500d.jpg' },
  { id: 'ja9200d', model: 'JA-9200D', name: 'Dàn karaoke di động JA-9200D', category: 'dan-karaoke',
    price: 12900000, stock: 15, tier: 4, watt: [1600, 1600], bassCm: 40, bassCount: 2,
    desc: 'Dàn karaoke di động công suất 1600W, bass 40cm x 2, kèm main TD-5002, vang cơ FX-999S và micro JA-889.',
    specs: { 'Công suất': '1600W', 'Loa bass': '40cm x 2', 'Main công suất': 'TD-5002', 'Vang cơ': 'FX-999S', 'Micro': 'JA-889', 'Ngõ kết nối': 'Bluetooth, USB, Optical, Coaxial' },
    features: ['Trọn bộ: loa, main, vang cơ và micro', 'Phù hợp gia đình, sự kiện, tiệc tùng'],
    img: 'images/ja9200d.jpg' },

  // ---- Loa karaoke di động ----
  { id: 'jhk2566pro', model: 'JHK-2566PRO', name: 'Loa karaoke di động cao cấp JHK-2566PRO', category: 'karaoke-di-dong',
    price: 8490000, stock: 15, tier: 4, watt: [500, 1000], bassCm: 50, bassCount: 2,
    desc: 'Loa karaoke di động cao cấp, bass 50cm x 2, 2 trung, 2 treble, công suất 500-1000W, 2 micro UHF, có bánh xe.',
    specs: { 'Công suất': '500-1000W', 'Hệ thống loa': 'Bass 50cm x 2, 2 trung, 2 treble', 'Bluetooth': '5.0', 'Xử lý âm thanh': 'Chip DSP x 2', 'Micro': '2 micro UHF', 'Kết nối': 'Bluetooth, USB, AUX, TF Card, cổng kết nối sub', 'Chất liệu': 'Gỗ cao cấp', 'Bảo hành': '12 tháng' },
    features: ['Có bánh xe, dễ di chuyển', 'Điều khiển bằng núm chỉnh tích hợp', 'Phù hợp không gian lớn, sự kiện, kinh doanh'],
    img: 'images/jhk2566pro.jpg' },
  { id: 'jhk2400pro', model: 'JHK-2400PRO', name: 'Loa karaoke di động cao cấp JHK-2400PRO', category: 'karaoke-di-dong',
    price: 6990000, stock: 15, tier: 3, watt: [500, 800], bassCm: 40, bassCount: 2,
    desc: 'Loa karaoke di động bass 40cm x 2, 2 treble, công suất 500-800W, chip DSP x 2, 2 micro UHF, có bánh xe.',
    specs: { 'Công suất': '500-800W', 'Hệ thống loa': 'Bass 40cm x 2, 2 treble', 'Bluetooth': '5.0', 'Xử lý âm thanh': 'Chip DSP x 2', 'Micro': '2 micro UHF', 'Kết nối': 'Bluetooth, USB, AUX, TF Card, cổng kết nối sub', 'Chất liệu': 'Gỗ cao cấp', 'Lưới loa': '2 màu: bạc và vàng', 'Bảo hành': '12 tháng' },
    features: ['Có bánh xe, dễ di chuyển', 'Phù hợp gia đình, sự kiện, kinh doanh'],
    img: 'images/jhk2400pro.jpg' },
  { id: 'jhk15d15', model: 'JHK-15D15', name: 'Loa karaoke di động JHK-15D15', category: 'karaoke-di-dong',
    price: 5490000, stock: 15, tier: 3, watt: [400, 800], bassCm: 40, bassCount: 1,
    desc: 'Loa karaoke di động bass 40cm, 1 trung, 1 treble, công suất 400-800W, chip DSP, 2 micro UHF, có bánh xe.',
    specs: { 'Công suất': '400-800W', 'Hệ thống loa': 'Bass 40cm, 1 trung, 1 treble', 'Bluetooth': '5.0', 'Xử lý âm thanh': 'Chip DSP', 'Micro': '2 micro UHF', 'Kết nối': 'Bluetooth, USB, AUX, TF Card', 'Chất liệu': 'Gỗ cao cấp', 'Lưới loa': '2 màu: bạc và vàng', 'Bảo hành': '12 tháng' },
    features: ['Có bánh xe, dễ di chuyển', 'Phù hợp gia đình, sự kiện, kinh doanh'],
    img: 'images/jhk15d15.jpg' },
  { id: 'jhk1512', model: 'JHK-1512', name: 'Loa karaoke di động JHK-1512', category: 'karaoke-di-dong',
    price: 4990000, stock: 15, tier: 3, watt: [350, 800], bassCm: 40, bassCount: 1,
    desc: 'Loa karaoke di động bass 40cm, 1 trung, 1 treble, công suất 350-800W, chip DSP, kết nối đôi TWS, 2 micro UHF.',
    specs: { 'Công suất': '350-800W', 'Hệ thống loa': 'Bass 40cm, 1 trung, 1 treble', 'Xử lý âm thanh': 'Chip DSP', 'Micro': '2 micro UHF', 'Kết nối': 'Bluetooth, USB, AUX, TF Card', 'Kết nối đôi': 'TWS (2 loa cùng lúc)', 'Màu lưới loa': 'Xám, vàng', 'Bảo hành': '12 tháng' },
    features: ['Ghép 2 loa cùng lúc bằng TWS', 'Có 2 màu lưới loa'],
    img: 'images/jhk1512.jpg' },
  { id: 'jhk1515', model: 'JHK-1515', name: 'Loa karaoke di động JHK-1515', category: 'karaoke-di-dong',
    price: 4590000, stock: 15, tier: 3, watt: [300, 600], bassCm: 40, bassCount: 1,
    desc: 'Loa karaoke di động bass 40cm, 1 trung, 1 treble, công suất 300-600W, chip DSP, 2 micro UHF.',
    specs: { 'Công suất': '300-600W', 'Hệ thống loa': 'Bass 40cm, 1 trung, 1 treble', 'Xử lý âm thanh': 'Chip DSP', 'Micro': '2 micro UHF', 'Kết nối': 'Bluetooth, USB, AUX, TF Card', 'Màu lưới loa': 'Xám, vàng', 'Bảo hành': '12 tháng' },
    features: ['Có 2 màu lưới loa', 'Đa kết nối'],
    img: 'images/jhk1515.jpg' },
  // XÁC NHẬN: poster ghi "8 Bass 40cm" và công suất "M300-450W"; mình hiểu là bass 40cm và 300-450W.
  { id: 'hka152', model: 'HK-A152', name: 'Loa karaoke di động cao cấp HK-A152', category: 'karaoke-di-dong',
    price: 3990000, stock: 15, tier: 2, watt: [300, 450], bassCm: 40, bassCount: 1,
    desc: 'Loa karaoke di động cao cấp, bass 40cm, 1 trung, 1 treble, Bluetooth 5.0, pin sử dụng lâu dài.',
    specs: { 'Công suất': '300-450W', 'Hệ thống loa': 'Bass 40cm, 1 trung, 1 treble', 'Bluetooth': '5.0', 'Kết nối': 'Bluetooth, AUX, USB', 'Lưới loa': '2 màu: bạc và vàng', 'Bảo hành': '12 tháng' },
    features: ['Pin sử dụng lâu dài', 'Có chip xử lý âm thanh số (DSP)'],
    img: 'images/hka152.jpg' },
  // XÁC NHẬN: poster ghi công suất "4150-350W" (chữ nhoè), nên chưa điền công suất.
  { id: 'hka122', model: 'HK-A122', name: 'Loa karaoke di động HK-A122', category: 'karaoke-di-dong',
    price: 2590000, stock: 15, tier: 2, watt: null, bassCm: 30, bassCount: 1,
    desc: 'Loa karaoke di động bass 30cm, 1 trung, 1 treble, Bluetooth 5.0, pin sử dụng lâu dài.',
    specs: { 'Hệ thống loa': 'Bass 30cm, 1 trung, 1 treble', 'Bluetooth': '5.0', 'Kết nối': 'Bluetooth, AUX, USB', 'Lưới loa': '2 màu: bạc và vàng', 'Bảo hành': '12 tháng' },
    features: ['Pin sử dụng lâu dài', 'Có chip xử lý âm thanh số (DSP)'],
    img: 'images/hka122.jpg' },
  { id: 'hk1011', model: 'HK-1011', name: 'Loa karaoke di động HK-1011', category: 'karaoke-di-dong',
    price: 1890000, stock: 15, tier: 1, watt: [150, 250], bassCm: 25, bassCount: 1,
    desc: 'Loa karaoke di động gọn nhẹ, bass 25cm, 1 trung, 1 treble, công suất 150-250W, kèm micro không dây.',
    specs: { 'Công suất': '150-250W', 'Hệ thống loa': 'Bass 25cm, 1 trung, 1 treble', 'Micro': 'Micro không dây', 'Kết nối': 'AUX, USB, Bluetooth', 'Bảo hành': '12 tháng' },
    features: ['Thiết kế gọn nhẹ, mang theo mọi nơi', 'Có chip xử lý âm thanh số (DSP)'],
    img: 'images/hk1011.jpg' },

  // ---- Loa xách tay ----
  { id: 'jhk258', model: 'JHK-258', name: 'Loa xách tay cao cấp JHK-258', category: 'xach-tay',
    price: 3290000, stock: 15, tier: 2, watt: [350, 600], bassCm: 20, bassCount: 2,
    desc: 'Loa karaoke xách tay bass 20cm x 2, 3 treble, 1 trung, công suất 350-600W, chip DSP x 2.',
    specs: { 'Công suất': '350-600W', 'Hệ thống loa': 'Bass 20cm x 2, 3 treble, 1 trung', 'Bluetooth': '5.0', 'Xử lý âm thanh': 'Chip DSP x 2', 'Kết nối': 'Bluetooth, USB, AUX, TF Card, cổng kết nối sub', 'Chất liệu': 'Gỗ cao cấp', 'Bảo hành': '12 tháng' },
    features: ['Có tay xách, dễ di chuyển', 'Nhỏ gọn, hợp phòng khách gia đình'],
    img: 'images/jhk258.jpg' },
  // XÁC NHẬN: poster ghi phiên bản Bluetooth "6.3" (có thể là 5.3), nên chưa điền phiên bản.
  { id: 'jhk209', model: 'JHK-209', name: 'Loa xách tay cao cấp JHK-209', category: 'xach-tay',
    price: 2990000, stock: 15, tier: 2, watt: [300, 500], bassCm: 20, bassCount: 2,
    desc: 'Loa karaoke xách tay bass 20cm x 2, 2 treble, công suất 300-500W, chip DSP, nhiều cổng kết nối.',
    specs: { 'Công suất': '300-500W', 'Hệ thống loa': 'Bass 20cm x 2, 2 treble', 'Xử lý âm thanh': 'Chip DSP', 'Kết nối': 'Bluetooth, USB, HDMI, Optical, AUX In, Jack 3.5mm, cổng kết nối sub', 'Chất liệu': 'Gỗ cao cấp', 'Bảo hành': '12 tháng' },
    features: ['Có tay xách, dễ di chuyển', 'Nhiều cổng kết nối: HDMI, Optical, AUX'],
    img: 'images/jhk209.jpg' },
  // XÁC NHẬN: poster ghi công suất "480-200W" (chữ nhoè), nên chưa điền công suất.
  { id: 'hka18', model: 'HK-A18', name: 'Loa xách tay cao cấp GO HK-A18', category: 'xach-tay',
    price: 1290000, stock: 15, tier: 1, watt: null, bassCm: 20, bassCount: 1,
    desc: 'Loa xách tay nhỏ gọn bass 20cm, 1 treble, Bluetooth 5.0, pin sử dụng lâu dài.',
    specs: { 'Hệ thống loa': 'Bass 20cm, 1 treble', 'Bluetooth': '5.0', 'Kết nối': 'Bluetooth, AUX, USB', 'Lưới loa': '2 màu: bạc và vàng', 'Bảo hành': '12 tháng' },
    features: ['Xách tay tiện lợi', 'Pin sử dụng lâu dài'],
    img: 'images/hka18.jpg' }
];

/* ============================================================================
   CƠ SỞ TRI THỨC SỰ CỐ (trả lời tức thì, không tốn AI)
   keywords viết KHÔNG DẤU, chữ thường. Tránh từ quá ngắn/chung vì sẽ khớp nhầm
   cả câu hỏi mua hàng (ví dụ "loa nào có bluetooth 5.0" không được coi là lỗi).
   ============================================================================ */
const FAULTS = [
  { id: 'nguon', label: 'Loa không lên nguồn / không sáng đèn',
    keywords: ['khong len nguon', 'khong sang den', 'khong bat duoc', 'khong mo duoc', 'chet nguon'],
    causes: [
      { name: 'Adapter / dây nguồn hỏng', steps: ['Thử adapter hoặc ổ cắm khác', 'Kiểm tra dây có đứt, gãy đầu cắm không'], fix: 'Thay adapter đúng thông số (điện áp, dòng) ghi trên loa.' },
      { name: 'Pin hết hoặc hỏng (với loa dùng pin)', steps: ['Cắm sạc khoảng 30 phút rồi thử bật lại', 'Quan sát đèn báo sạc có sáng không'], fix: 'Nếu cắm sạc vẫn không lên, cần kiểm tra pin hoặc mạch sạc.' },
      { name: 'Board nguồn trong loa bị cháy', steps: ['Nếu adapter tốt mà đèn vẫn không sáng, nghi ngờ board nguồn'], fix: 'Cần kỹ thuật viên kiểm tra và thay board nguồn.' }
    ],
    level: 'Trung bình', tech: true },
  { id: 'tieng', label: 'Loa mất tiếng, mất bass hoặc mất treble',
    keywords: ['khong co tieng', 'mat tieng', 'im lang', 'khong ra tieng', 'mat bass', 'khong co bass', 'khong co treble', 'mat treble', 'chi con bass'],
    causes: [
      { name: 'Cài đặt hoặc nguồn tín hiệu', steps: ['Kiểm tra núm volume tổng, volume nhạc, volume micro và nút tắt tiếng', 'Đổi nguồn phát (Bluetooth, USB, AUX) và thử thiết bị khác', 'Nếu chỉ mất tiếng ở một ngõ (ví dụ Bluetooth) thì lỗi nằm ở ngõ đó'], fix: 'Đặt lại âm lượng, chọn đúng ngõ vào, thử dây hoặc thiết bị khác.' },
      { name: 'Dây nối củ loa tuột hoặc oxy hoá', steps: ['Rút điện, tắt hẳn loa rồi mới kiểm tra các đầu dây nối củ loa có lỏng không (chỉ làm nếu bạn quen thao tác)'], fix: 'Cắm chặt lại, làm sạch đầu nối.' },
      { name: 'Củ loa treble/bass hoặc mạch công suất hỏng', steps: ['Nếu chỉ mất bass hoặc chỉ mất treble, nhiều khả năng củ loa hoặc mạch phân tần tương ứng bị hỏng', 'Nếu mất toàn bộ tiếng dù nguồn tín hiệu tốt, nghi mạch công suất'], fix: 'Cần kỹ thuật viên đo và thay linh kiện.' }
    ],
    level: 'Trung bình', tech: true },
  { id: 'cot', label: 'Loa kêu cót két, giòn âm, tiếng hở',
    keywords: ['keu cot', 'gion am', 'tieng ho', 'cot ket', 'keu re', 'bi re'],
    causes: [
      { name: 'Cuộn dây (voice coil) loa treble hoặc bass bị rách / cọ', steps: ['Hạ âm lượng, phát âm tần thấp rồi nghe xem tiếng cọ phát ra từ củ loa nào', 'Nhấn nhẹ đều màng loa, nếu có tiếng cọ là nghi ngờ voice coil'], fix: 'Thay củ loa hoặc quấn lại voice coil.' },
      { name: 'Board phân tần (crossover) bị lỗi', steps: ['Quan sát linh kiện cháy xém, tụ phồng'], fix: 'Thay linh kiện hoặc board phân tần.' },
      { name: 'Ốc / gioăng lỏng gây rung', steps: ['Siết lại ốc củ loa, kiểm tra gioăng kín'], fix: 'Siết ốc, dán lại gioăng.' }
    ],
    level: 'Trung bình', tech: true },
  { id: 'meo', label: 'Âm thanh méo, rè khi mở lớn',
    keywords: ['meo am', 'distortion', 'rung ranh', 'mo lon', 'bi meo'],
    causes: [
      { name: 'Amply chạy quá công suất (clipping)', steps: ['Giảm âm lượng còn khoảng 70% rồi nghe lại', 'Giảm bass/EQ boost nếu đang bật'], fix: 'Dùng amply đủ công suất, không để volume sát max.' },
      { name: 'Màng loa bass bị lõm / rách', steps: ['Quan sát màng loa dưới ánh sáng', 'Nhấn nhẹ viền màng, thấy rách hoặc biến dạng là hư'], fix: 'Thay màng hoặc củ loa.' },
      { name: 'Nguồn tín hiệu kém', steps: ['Thử nguồn phát và dây khác'], fix: 'Thay dây, cổng kết nối.' }
    ],
    level: 'Thấp – Trung bình', tech: false },
  { id: 'hu', label: 'Loa hú, rít khi hát karaoke',
    keywords: ['tieng hu', 'hu rit', 'hu khi hat', 'hu mic', 'hu micro', 'mic hu', 'micro hu', 'tieng rit'],
    causes: [
      { name: 'Micro quá gần hoặc hướng thẳng vào loa', steps: ['Đứng xa loa hơn, không đưa micro ra phía trước mặt loa', 'Quay mặt loa ra xa vị trí người hát'], fix: 'Đổi vị trí đặt loa và vị trí người hát.' },
      { name: 'Âm lượng micro, echo hoặc treble quá cao', steps: ['Giảm volume micro', 'Giảm echo / reverb', 'Giảm treble'], fix: 'Chỉnh lại micro, echo, treble đến khi hết hú.' },
      { name: 'Micro hoặc đầu thu có vấn đề', steps: ['Thử micro khác', 'Tắt các micro không dùng'], fix: 'Thay micro hoặc nhờ kỹ thuật viên kiểm tra đầu thu.' }
    ],
    level: 'Thấp', tech: false },
  { id: 'mic', label: 'Micro không dây (UHF) không nhận, rè hoặc mất sóng',
    keywords: ['mic khong nhan', 'micro khong nhan', 'mic khong hat', 'micro khong hat', 'mic khong len', 'micro khong len', 'mic khong co tieng', 'micro khong co tieng', 'mic re','micro re', 'mat song', 'mic bi dut', 'micro bi dut', 'mic yeu', 'micro yeu'],
    causes: [
      { name: 'Pin micro yếu', steps: ['Thay pin mới cho micro', 'Kiểm tra cực pin có sạch, không gỉ'], fix: 'Dùng pin chất lượng tốt, thay đúng chiều cực.' },
      { name: 'Micro chưa dò đúng kênh hoặc bị nhiễu sóng', steps: ['Tắt rồi bật lại cả micro và loa', 'Đưa micro lại gần loa trong vài giây rồi thử lại', 'Tránh đặt loa cạnh router Wi-Fi hoặc thiết bị gây nhiễu'], fix: 'Dò lại kênh theo hướng dẫn của loa, đổi vị trí đặt loa.' },
      { name: 'Micro hoặc đầu thu hỏng', steps: ['Thử micro này với loa khác và micro khác với loa của bạn để biết hỏng ở đâu'], fix: 'Thay micro hoặc nhờ kỹ thuật viên kiểm tra đầu thu.' }
    ],
    level: 'Thấp', tech: false },
  { id: 'pin', label: 'Pin nhanh hết hoặc loa không sạc được',
    keywords: ['khong sac', 'sac khong vao', 'het pin nhanh', 'pin nhanh het', 'pin yeu', 'pin chai', 'khong nhan sac'],
    causes: [
      { name: 'Adapter hoặc dây sạc không đúng', steps: ['Dùng đúng adapter đi kèm hoặc đúng thông số ghi trên loa', 'Thử ổ cắm khác'], fix: 'Thay adapter đúng điện áp và dòng.' },
      { name: 'Cổng sạc lỏng hoặc bẩn', steps: ['Quan sát cổng sạc có bụi, gỉ hoặc lỏng không; đèn báo sạc có sáng không'], fix: 'Vệ sinh nhẹ khi đã rút điện; cổng lỏng cần thay.' },
      { name: 'Pin đã chai', steps: ['Nếu dùng nhiều năm, thời gian dùng giảm mạnh dù sạc đầy', 'Nếu pin phồng, nóng bất thường hoặc có mùi lạ: ngừng dùng, rút sạc ngay, không tự tháo pin'], fix: 'Thay pin cùng loại; việc này nên nhờ kỹ thuật viên.' }
    ],
    level: 'Trung bình', tech: true },
  { id: 'bt', label: 'Bluetooth không kết nối / hay ngắt',
    keywords: ['bluetooth khong', 'bluetooth bi', 'bluetooth loi', 'bluetooth ngat', 'khong ket noi', 'ngat ket noi', 'khong pair', 'khong ghep doi'],
    causes: [
      { name: 'Loa chưa ở chế độ ghép đôi', steps: ['Bật chế độ Pair (đèn nhấp nháy)', 'Xoá loa khỏi danh sách Bluetooth trên điện thoại rồi ghép lại'], fix: 'Ghép đôi lại từ đầu.' },
      { name: 'Cần reset loa', steps: ['Nhấn giữ nút nguồn khoảng 5 giây'], fix: 'Reset và kết nối lại.' },
      { name: 'Module Bluetooth lỗi phần cứng', steps: ['Nếu đã reset mà vẫn không kết nối với nhiều thiết bị khác nhau'], fix: 'Thay module Bluetooth.' }
    ],
    level: 'Thấp', tech: false }
];

module.exports = { CATEGORIES, PRODUCTS, FAULTS };
