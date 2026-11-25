const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db, setSetting, getAllSettings, getCurrentPeriod } = require('./src/db');
const { sendPaymentReminders, startScheduler } = require('./src/notifications');

const app = express();
const PORT = process.env.PORT || 3050;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.json());
app.use(express.static(PUBLIC_DIR, { index: 'admin.html' }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'application/pdf',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim (JPG, PNG, WEBP) veya PDF yükleyebilirsiniz.'));
    }
  },
});

function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  const { admin_pin } = getAllSettings();
  if (!pin || String(pin) !== String(admin_pin)) {
    return res.status(401).json({ error: 'Yetkisiz erişim. Admin PIN hatalı.' });
  }
  next();
}

function generateMemberToken(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8) || 'uye';
  return `${slug}-${crypto.randomBytes(3).toString('hex')}`;
}

// --- Health & External Cron Endpoint ---

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/cron/check', async (req, res) => {
  const secret = process.env.CRON_SECRET || getAllSettings().admin_pin;
  if (req.query.key !== secret) {
    return res.status(401).json({ error: 'Yetkisiz.' });
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const { payment_day } = getAllSettings();
  if (tomorrow.getDate() !== payment_day) {
    return res.json({ ok: true, triggered: false, reason: 'Yarın ödeme günü değil.' });
  }
  const result = await sendPaymentReminders();
  res.json({ ok: true, triggered: true, ...result });
});

// --- Public / Member Routes ---

app.get('/api/vapid-public-key', (_req, res) => {
  const { vapid_public_key } = getAllSettings();
  res.json({ publicKey: vapid_public_key });
});

app.get('/api/member/:token', (req, res) => {
  const member = db.prepare('SELECT id, name, token, created_at FROM members WHERE token = ?').get(req.params.token);
  if (!member) {
    return res.status(404).json({ error: 'Üye bulunamadı.' });
  }

  const settings = getAllSettings();
  const period = getCurrentPeriod();
  const currentPayment = db
    .prepare('SELECT * FROM payments WHERE member_id = ? AND period = ?')
    .get(member.id, period);

  const history = db
    .prepare('SELECT id, period, status, note, uploaded_at, reviewed_at, receipt_filename FROM payments WHERE member_id = ? ORDER BY period DESC LIMIT 12')
    .all(member.id);

  const subCount = db
    .prepare('SELECT COUNT(*) as count FROM push_subscriptions WHERE member_id = ?')
    .get(member.id).count;

  res.json({
    member,
    period,
    currentPayment: currentPayment || null,
    history,
    hasPushSubscription: subCount > 0,
    settings: {
      payment_day: settings.payment_day,
      amount_per_person: settings.amount_per_person,
      iban_info: settings.iban_info,
    },
  });
});

app.post('/api/member/:token/subscribe', (req, res) => {
  const member = db.prepare('SELECT id FROM members WHERE token = ?').get(req.params.token);
  if (!member) {
    return res.status(404).json({ error: 'Üye bulunamadı.' });
  }

  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Geçersiz bildirim aboneliği.' });
  }

  db.prepare(
    `INSERT INTO push_subscriptions (member_id, endpoint, subscription_json)
     VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, subscription_json = excluded.subscription_json`
  ).run(member.id, subscription.endpoint, JSON.stringify(subscription));

  res.json({ ok: true });
});

app.post('/api/member/:token/upload', upload.single('receipt'), (req, res) => {
  const member = db.prepare('SELECT id FROM members WHERE token = ?').get(req.params.token);
  if (!member) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Üye bulunamadı.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Lütfen bir dekont dosyası seçin.' });
  }

  const period = req.body.period || getCurrentPeriod();
  const note = (req.body.note || '').trim().slice(0, 300);

  // Remove old file if re-uploading for the same period
  const existing = db
    .prepare('SELECT receipt_filename FROM payments WHERE member_id = ? AND period = ?')
    .get(member.id, period);

  if (existing && existing.receipt_filename) {
    const oldPath = path.join(UPLOADS_DIR, path.basename(existing.receipt_filename));
    fs.unlink(oldPath, () => {});
  }

  db.prepare(
    `INSERT INTO payments (member_id, period, status, receipt_filename, receipt_original_name, note, uploaded_at, reviewed_at)
     VALUES (?, ?, 'pending', ?, ?, ?, datetime('now'), NULL)
     ON CONFLICT(member_id, period) DO UPDATE SET
       status = 'pending',
       receipt_filename = excluded.receipt_filename,
       receipt_original_name = excluded.receipt_original_name,
       note = excluded.note,
       uploaded_at = datetime('now'),
       reviewed_at = NULL`
  ).run(member.id, period, req.file.filename, req.file.originalname, note);

  const payment = db
    .prepare('SELECT * FROM payments WHERE member_id = ? AND period = ?')
    .get(member.id, period);

  res.json({ ok: true, payment });
});

// --- Receipt Viewing (Admin PIN or Member Token) ---

app.get('/api/receipts/:filename', (req, res) => {
  const safeFile = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, safeFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Dosya bulunamadı.' });
  }

  const pin = req.headers['x-admin-pin'] || req.query.pin;
  const token = req.query.token;
  const { admin_pin } = getAllSettings();

  if (pin && String(pin) === String(admin_pin)) {
    return res.sendFile(safeFile, { root: UPLOADS_DIR });
  }

  if (token) {
    const row = db
      .prepare(
        `SELECT p.id FROM payments p
         JOIN members m ON m.id = p.member_id
         WHERE p.receipt_filename = ? AND m.token = ?`
      )
      .get(safeFile, token);
    if (row) return res.sendFile(safeFile, { root: UPLOADS_DIR });
  }

  return res.status(401).json({ error: 'Yetkisiz erişim.' });
});

// --- Admin Routes ---

app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body || {};
  const { admin_pin } = getAllSettings();
  if (!pin || String(pin) !== String(admin_pin)) {
    return res.status(401).json({ error: 'PIN hatalı.' });
  }
  res.json({ ok: true });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const period = req.query.period || getCurrentPeriod();
  const settings = getAllSettings();

  const members = db.prepare('SELECT * FROM members ORDER BY id ASC').all();
  const payments = db.prepare('SELECT * FROM payments WHERE period = ?').all(period);
  const subCounts = db
    .prepare('SELECT member_id, COUNT(*) as count FROM push_subscriptions GROUP BY member_id')
    .all();

  const paymentByMember = new Map(payments.map((p) => [p.member_id, p]));
  const subsByMember = new Map(subCounts.map((s) => [s.member_id, s.count]));

  const rows = members.map((m) => ({
    ...m,
    hasPush: (subsByMember.get(m.id) || 0) > 0,
    payment: paymentByMember.get(m.id) || null,
  }));

  const stats = {
    total: rows.length,
    approved: rows.filter((r) => r.payment?.status === 'approved').length,
    pending: rows.filter((r) => r.payment?.status === 'pending').length,
    rejected: rows.filter((r) => r.payment?.status === 'rejected').length,
    unpaid: rows.filter((r) => !r.payment).length,
  };

  res.json({
    period,
    stats,
    members: rows,
    settings: {
      payment_day: settings.payment_day,
      amount_per_person: settings.amount_per_person,
      iban_info: settings.iban_info,
    },
  });
});

app.get('/api/admin/matrix', requireAdmin, (req, res) => {
  const year = String(req.query.year || new Date().getFullYear());
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const members = db.prepare('SELECT id, name FROM members ORDER BY id ASC').all();
  const payments = db
    .prepare('SELECT id, member_id, period, status, receipt_filename, note, uploaded_at FROM payments WHERE period LIKE ?')
    .all(`${year}-%`);

  const paymentMap = new Map();
  for (const p of payments) {
    paymentMap.set(`${p.member_id}:${p.period}`, p);
  }

  const rows = members.map((m) => ({
    id: m.id,
    name: m.name,
    months: months.map((period) => paymentMap.get(`${m.id}:${period}`) || null),
  }));

  res.json({ year, months, rows });
});

app.post('/api/admin/members', requireAdmin, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Üye adı boş olamaz.' });
  }

  const token = generateMemberToken(name);
  const info = db.prepare('INSERT INTO members (name, token) VALUES (?, ?)').run(name, token);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ member });
});

app.delete('/api/admin/members/:id', requireAdmin, (req, res) => {
  const files = db
    .prepare('SELECT receipt_filename FROM payments WHERE member_id = ?')
    .all(req.params.id);

  for (const f of files) {
    if (f.receipt_filename) {
      fs.unlink(path.join(UPLOADS_DIR, path.basename(f.receipt_filename)), () => {});
    }
  }

  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/payments/:id/review', requireAdmin, (req, res) => {
  const { status, note } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz durum.' });
  }

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) {
    return res.status(404).json({ error: 'Ödeme kaydı bulunamadı.' });
  }

  db.prepare(
    `UPDATE payments SET status = ?, note = COALESCE(?, note), reviewed_at = datetime('now') WHERE id = ?`
  ).run(status, note !== undefined ? String(note).trim().slice(0, 300) : null, req.params.id);

  const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  res.json({ ok: true, payment: updated });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const { payment_day, amount_per_person, iban_info, new_pin } = req.body || {};

  if (payment_day !== undefined) {
    const day = Number(payment_day);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return res.status(400).json({ error: 'Ödeme günü 1 ile 28 arasında olmalıdır.' });
    }
    setSetting('payment_day', day);
  }

  if (amount_per_person !== undefined) {
    setSetting('amount_per_person', String(amount_per_person).trim());
  }

  if (iban_info !== undefined) {
    setSetting('iban_info', String(iban_info).trim());
  }

  if (new_pin && String(new_pin).trim().length >= 4) {
    setSetting('admin_pin', String(new_pin).trim());
  }

  res.json({ ok: true });
});

app.post('/api/admin/notify', requireAdmin, async (req, res) => {
  try {
    const { memberId, force } = req.body || {};
    const result = await sendPaymentReminders({
      memberId: memberId ? Number(memberId) : null,
      force: Boolean(force),
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Frontend Page Routes ---

app.get('/m/:token/manifest.json', (req, res) => {
  const token = req.params.token;
  const member = db.prepare('SELECT name FROM members WHERE token = ?').get(token);
  const title = member ? `YT Aile - ${member.name}` : 'YouTube Aile';
  res.json({
    name: title,
    short_name: 'YT Aile',
    description: 'YouTube Aile ödeme hatırlatma ve dekont yükleme uygulaması',
    start_url: `/m/${encodeURIComponent(token)}`,
    scope: `/m/${encodeURIComponent(token)}`,
    display: 'standalone',
    background_color: '#0f0f0f',
    theme_color: '#ff0033',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  });
});

app.get('/m/:token', (req, res) => {
  const htmlPath = path.join(PUBLIC_DIR, 'member.html');
  const html = fs
    .readFileSync(htmlPath, 'utf8')
    .replace('href="/manifest.json"', `href="/m/${encodeURIComponent(req.params.token)}/manifest.json"`);
  res.type('html').send(html);
});

app.get('/', (_req, res) => {
  res.sendFile('admin.html', { root: PUBLIC_DIR });
});

// Multer & global error handler
app.use((err, _req, res, _next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Bir hata oluştu.' });
  }
});

startScheduler();

app.listen(PORT, () => {
  console.log(`YouTube Aile sunucusu calisiyor: http://localhost:${PORT}`);
});
