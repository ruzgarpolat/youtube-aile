const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const webpush = require('web-push');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'youtube_aile.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    receipt_filename TEXT NOT NULL,
    receipt_original_name TEXT NOT NULL,
    note TEXT DEFAULT '',
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE(member_id, period)
  );
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function initDefaults() {
  if (!getSetting('payment_day')) setSetting('payment_day', '15');
  if (!getSetting('amount_per_person')) setSetting('amount_per_person', '115');
  if (!getSetting('iban_info')) setSetting('iban_info', 'TR00 0000 0000 0000 0000 0000 00 - Ad Soyad');
  if (!getSetting('admin_pin')) setSetting('admin_pin', process.env.ADMIN_PIN || '1234');

  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) {
    setSetting('vapid_public_key', envPub);
    setSetting('vapid_private_key', envPriv);
  } else if (!getSetting('vapid_public_key') || !getSetting('vapid_private_key')) {
    const keys = webpush.generateVAPIDKeys();
    setSetting('vapid_public_key', keys.publicKey);
    setSetting('vapid_private_key', keys.privateKey);
  }
}

initDefaults();

function getAllSettings() {
  return {
    payment_day: Number(getSetting('payment_day', '15')),
    amount_per_person: getSetting('amount_per_person', '115'),
    iban_info: getSetting('iban_info', ''),
    admin_pin: getSetting('admin_pin', '1234'),
    vapid_public_key: getSetting('vapid_public_key'),
    vapid_private_key: getSetting('vapid_private_key'),
  };
}

function getCurrentPeriod(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

module.exports = {
  db,
  getSetting,
  setSetting,
  getAllSettings,
  getCurrentPeriod,
};
