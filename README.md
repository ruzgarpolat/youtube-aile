# YouTube Aile - Ödeme & Dekont Takip Uygulaması

Arkadaşlarına ödeme gününden 1 gün önce **doğrudan telefona bildirim (PWA Web Push)** gönderen, dekont yüklemelerini sağlayan ve senin tek bir kontrol panelinden onay/ret verebildiğin sade web uygulaması.

## Özellikler
- **Otomatik Hatırlatıcı:** Her gün saat 10:00'da kontrol eder; yarın ödeme günü ise henüz ödememiş ve bildirimleri açmış arkadaşlara telefon bildirimi gönderir.
- **Arkadaşlara Özel Link (`/m/<token>`):** Şifre veya kayıt olmadan, tek linkle girip **Ana Ekrana Ekle** diyerek uygulama gibi kullanabilirler.
- **Dekont Yükleme:** JPG, PNG veya PDF formatında dekont yükleme ve geçmiş ödemeleri görme.
- **Kontrol Paneli (`/`):** Varsayılan PIN `1234`. Onayla/Reddet, dekont önizleme, dönem filtresi, IBAN/tutar/gün ayarları ve tek tıkla manuel hatırlatma gönderme.

## Yerelde Çalıştırma
```bash
npm install
npm start
```
Tarayıcıda `http://localhost:3050` adresini açın.

## İnternete Yayınlama (Render / Railway)
1. Bu klasörü GitHub'a yükleyin.
2. Render veya Railway üzerinde yeni bir **Web Service** oluşturun (`Build Command: npm install`, `Start Command: npm start`).
3. Ortam değişkeni (Environment Variable) olarak `ADMIN_PIN` belirleyin (örn. kendi belirlediğin 4-6 haneli PIN).
4. **Önemli:** Web Push bildirimleri sadece **HTTPS** (yayındaki link) veya `localhost` üzerinde çalışır. Kalıcı veri için Render/Railway'de `/app/data` ve `/app/uploads` klasörlerine bir **Persistent Disk / Volume** bağlaman önerilir.
