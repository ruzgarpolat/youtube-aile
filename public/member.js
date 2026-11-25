const token = window.location.pathname.split('/').filter(Boolean).pop();

const STATUS_MAP = {
  approved: { label: 'Onaylandı', cls: 'badge-approved' },
  pending: { label: 'İnceleniyor', cls: 'badge-pending' },
  rejected: { label: 'Reddedildi', cls: 'badge-rejected' },
  unpaid: { label: 'Ödenmedi', cls: 'badge-unpaid' },
};

let memberData = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = msg;
  box.classList.remove('hidden');
}

function showUploadAlert(msg, type = 'success') {
  const box = document.getElementById('uploadAlert');
  box.textContent = msg;
  box.className = `alert alert-${type}`;
  box.classList.remove('hidden');
}

async function loadMember() {
  try {
    const res = await fetch(`/api/member/${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Üye bilgisi yüklenemedi.');
      return;
    }

    memberData = data;
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('periodBadge').textContent = data.period;
    document.getElementById('greetingTitle').textContent = `Merhaba, ${data.member.name}`;
    document.getElementById('paymentDayInfo').textContent = `Her ayın ${data.settings.payment_day}. günü ödeme günüdür.`;
    document.getElementById('amountText').textContent = `${data.settings.amount_per_person} TL`;
    document.getElementById('ibanText').textContent = data.settings.iban_info;

    const statusKey = data.currentPayment ? data.currentPayment.status : 'unpaid';
    const st = STATUS_MAP[statusKey] || STATUS_MAP.unpaid;
    const badge = document.getElementById('statusBadge');
    badge.textContent = st.label;
    badge.className = `badge ${st.cls}`;

    if (data.currentPayment?.status === 'rejected' && data.currentPayment.note) {
      showUploadAlert(`Reddedilme sebebi: ${data.currentPayment.note}`, 'error');
    }

    const pushStatus = document.getElementById('pushStatus');
    if (data.hasPushSubscription) {
      pushStatus.textContent = 'Bildirimler aktif.';
    }

    renderHistory(data.history);
  } catch {
    showError('Sunucuya bağlanılamadı.');
  }
}

function renderHistory(history) {
  const container = document.getElementById('historyList');
  if (!history || history.length === 0) {
    container.innerHTML = '<p class="muted">Henüz ödeme kaydı yok.</p>';
    return;
  }

  container.innerHTML = history
    .map((item) => {
      const st = STATUS_MAP[item.status] || STATUS_MAP.unpaid;
      const receiptUrl = `/api/receipts/${encodeURIComponent(item.receipt_filename)}?token=${encodeURIComponent(token)}`;
      return `
        <div class="member-row">
          <div>
            <strong>${item.period}</strong>
            ${item.note ? `<div class="muted" style="font-size:0.82rem;">${escapeHtml(item.note)}</div>` : ''}
          </div>
          <div class="member-actions">
            <span class="badge ${st.cls}">${st.label}</span>
            <a class="btn btn-sm" href="${receiptUrl}" target="_blank" rel="noopener">Dekont</a>
          </div>
        </div>
      `;
    })
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.getElementById('copyIbanBtn').addEventListener('click', async () => {
  if (!memberData) return;
  try {
    await navigator.clipboard.writeText(memberData.settings.iban_info);
    const btn = document.getElementById('copyIbanBtn');
    btn.textContent = 'Kopyalandı!';
    setTimeout(() => (btn.textContent = 'Kopyala'), 1500);
  } catch {
    alert(memberData.settings.iban_info);
  }
});

document.getElementById('enablePushBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('pushStatus');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    statusEl.textContent = 'Bu tarayıcı push bildirimlerini desteklemiyor.';
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      statusEl.textContent = 'Bildirim izni verilmedi.';
      return;
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const keyRes = await fetch('/api/vapid-public-key');
    const { publicKey } = await keyRes.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const subRes = await fetch(`/api/member/${encodeURIComponent(token)}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    if (subRes.ok) {
      statusEl.textContent = 'Bildirimler başarıyla açıldı!';
    } else {
      statusEl.textContent = 'Abonelik kaydedilemedi.';
    }
  } catch (err) {
    statusEl.textContent = `Hata: ${err.message}`;
  }
});

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('receiptInput');
  const noteInput = document.getElementById('noteInput');
  const btn = document.getElementById('uploadBtn');

  if (!fileInput.files[0]) return;

  const formData = new FormData();
  formData.append('receipt', fileInput.files[0]);
  formData.append('note', noteInput.value.trim());

  btn.disabled = true;
  btn.textContent = 'Yükleniyor...';

  try {
    const res = await fetch(`/api/member/${encodeURIComponent(token)}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      showUploadAlert(data.error || 'Yükleme başarısız.', 'error');
    } else {
      showUploadAlert('Dekontun gönderildi! Yönetici onayı bekleniyor.', 'success');
      fileInput.value = '';
      noteInput.value = '';
      await loadMember();
    }
  } catch {
    showUploadAlert('Bağlantı hatası.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Dekontu Gönder';
  }
});

// Register service worker early for PWA installability
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

loadMember();
