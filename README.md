# 📺 YouTube Aile — Ödeme & Dekont Takip Uygulaması

> Ortak YouTube Premium ailesindeki arkadaşlara otomatik ödeme hatırlatması gönderen, dekont yüklemelerini yöneten ve yöneticiye tek ekrandan tam kontrol sağlayan **Progressive Web App**.

[![Node.js](https://img.shields.io/badge/Node.js-24-green?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-black?logo=express)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-built--in-blue?logo=sqlite)](https://nodejs.org/api/sqlite.html)
[![PWA](https://img.shields.io/badge/PWA-Web%20Push-purple?logo=pwa)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🚀 Canlı Demo

**🔗 [youtube-aile.onrender.com](https://youtube-aile.onrender.com)**

> Admin PIN: `1234` (demo amaçlı)

---

## ✨ Özellikler

| Özellik | Detay |
|--------|-------|
| 🔔 **Otomatik Push Bildirimi** | Ödeme gününden 1 gün önce telefonlara Web Push bildirimi gönderir |
| 📱 **PWA (Ana Ekrana Ekle)** | Uygulama mağazası olmadan iOS & Android'e kurulabilir |
| 🧾 **Dekont Yükleme** | Üyeler kişisel linklerinden JPG/PNG/PDF dekont yükler |
| ✅ **Onayla / Reddet** | Yönetici dekontu inceleyip onaylayabilir veya reddedebilir |
| 📊 **12 Aylık Takip Tablosu** | Kim hangi ay ödedi, tek bakışta görünür |
| 🔗 **Şifresiz Kişisel Link** | Her üyeye benzersiz token ile özel sayfa |
| ⚙️ **Yönetim Paneli** | Ödeme günü, tutar, IBAN ve PIN ayarları |
| 📅 **Cron Desteği** | Harici cron servislerle (cron-job.org) 7/24 zamanlama |

---

## 🛠️ Teknoloji Stack

```
Backend      → Node.js 24 + Express 5
Veritabanı   → SQLite (node:sqlite — native, bağımlılık yok)
Bildirimler  → Web Push API (VAPID) + Service Worker
Zamanlayıcı  → node-cron + harici HTTP cron (cron-job.org)
Dosya Upload → Multer (10 MB limit, tip doğrulama)
Frontend     → Vanilla JS + PWA (manifest, service worker)
Deployment   → Render (free tier) + GitHub CI
```

---

## 📸 Ekran Görüntüleri

### 🖥️ Admin Kontrol Paneli
Üyelerin ödeme durumları, yüklenen dekontlar ve sağda **12 aylık ödeme matrisi**:

```
┌─────────────────────────────────┬──────────────────────────┐
│  Arkadaşlar & Dekontlar         │  12 Aylık Ödeme Takibi   │
│  ─────────────────────────────  │  ─────────────────────── │
│  Musti    [İnceleniyor] [Dekont] │  Oca Şub Mar Nis May ... │
│  Ahmet    [Onaylandı]           │   ✓   ✓   ✓   •   –  ... │
│  Zeynep   [Ödenmedi]            │   ✓   –   ✓   –   –  ... │
└─────────────────────────────────┴──────────────────────────┘
```

### 📱 Üye Sayfası (Mobil)
Arkadaşın kişisel sayfası: IBAN kopyalama, bildirim açma, dekont yükleme.

---

## 🏗️ Mimari

```
┌──────────────┐    Push Bildirimi    ┌──────────────────┐
│  cron-job.org│ ──────────────────▶ │  Render Sunucu   │
└──────────────┘                     │  (Node.js/Express)│
                                     │                   │
┌──────────────┐    /m/:token        │  ┌─────────────┐  │
│  Üye Telefonu│ ◀──────────────────▶│  │   SQLite DB │  │
│  (PWA)       │    Dekont Upload    │  └─────────────┘  │
└──────────────┘                     │                   │
                                     │  /uploads/        │
┌──────────────┐    Admin Panel      │  (Dekontlar)      │
│  Yönetici    │ ◀──────────────────▶│                   │
│  (Tarayıcı)  │    PIN: ****        └──────────────────┘
└──────────────┘
```

---

## ⚡ Kurulum & Çalıştırma

### Gereksinimler
- Node.js 22+ (native SQLite için)
- npm

### Yerelde Çalıştır

```bash
git clone https://github.com/ruzgarpolat/youtube-aile.git
cd youtube-aile
npm install
npm start
```

Tarayıcıda aç: `http://localhost:3050`

### Ortam Değişkenleri (İsteğe Bağlı)

| Değişken | Varsayılan | Açıklama |
|----------|-----------|----------|
| `PORT` | `3050` | Sunucu portu |
| `ADMIN_PIN` | `1234` | Yönetici giriş PIN'i |
| `VAPID_PUBLIC_KEY` | Auto-generated | Web Push public key |
| `VAPID_PRIVATE_KEY` | Auto-generated | Web Push private key |
| `CRON_SECRET` | Admin PIN | Harici cron endpoint güvenlik anahtarı |

---

## ☁️ Render'a Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ruzgarpolat/youtube-aile)

1. Render hesabınla oturum aç
2. **New → Blueprint** → Bu repoyu seç
3. `ADMIN_PIN` environment variable'ını belirle
4. Deploy et — birkaç dakikada hazır!

### Otomatik Bildirim (cron-job.org)
Render ücretsiz paket 15 dk sonra uyku moduna geçer. Bildirimlerin düzenli gitmesi için:

1. [cron-job.org](https://cron-job.org) üzerinden ücretsiz hesap aç
2. Her gün saat 10:00'a ayarlanmış şu URL için cron job oluştur:
   ```
   https://youtube-aile.onrender.com/api/cron/check?key=YOUR_ADMIN_PIN
   ```

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/api/member/:token` | Token | Üye bilgisi ve ödeme geçmişi |
| POST | `/api/member/:token/upload` | Token | Dekont yükle |
| POST | `/api/member/:token/subscribe` | Token | Push aboneliği kaydet |
| GET | `/api/admin/dashboard` | PIN | Dönem özeti ve üye listesi |
| GET | `/api/admin/matrix` | PIN | 12 aylık ödeme matrisi |
| POST | `/api/admin/members` | PIN | Yeni üye ekle |
| DELETE | `/api/admin/members/:id` | PIN | Üye sil |
| POST | `/api/admin/payments/:id/review` | PIN | Onayla / Reddet |
| PUT | `/api/admin/settings` | PIN | Ayarları güncelle |
| POST | `/api/admin/notify` | PIN | Manuel bildirim gönder |
| GET | `/api/cron/check` | Key | Harici cron tetikleyici |

---

## 🔒 Güvenlik

- Her üyeye kriptografik rastgele **token** (`crypto.randomBytes`) üretilir
- Dekont dosyaları sunucu tarafında UUID ile yeniden adlandırılır, orijinal isimle erişilemez
- Dosya türü MIME kontrolü yapılır (JPG/PNG/WEBP/HEIC/PDF)
- Admin PIN her endpoint'te `x-admin-pin` header ile doğrulanır
- VAPID anahtarları ilk çalıştırmada otomatik üretilip veritabanında saklanır

---

## 📄 Lisans

MIT © [Rüzgar Polat](https://github.com/ruzgarpolat)
