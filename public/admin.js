const STATUS_MAP = {
  approved: { label: 'Onaylandı', cls: 'badge-approved' },
  pending: { label: 'İnceleniyor', cls: 'badge-pending' },
  rejected: { label: 'Reddedildi', cls: 'badge-rejected' },
  unpaid: { label: 'Ödenmedi', cls: 'badge-unpaid' },
};

let adminPin = sessionStorage.getItem('yt_admin_pin') || '';
let activePaymentId = null;

function getDefaultPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function showDashAlert(msg, type = 'info') {
  const box = document.getElementById('dashAlert');
  box.textContent = msg;
  box.className = `alert alert-${type}`;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 5000);
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), 'x-admin-pin': adminPin };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Oturum süresi doldu veya PIN hatalı.');
  }
  return res;
}

function logout() {
  adminPin = '';
  sessionStorage.removeItem('yt_admin_pin');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('loginCard').classList.remove('hidden');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadDashboard() {
  const periodPicker = document.getElementById('periodPicker');
  if (!periodPicker.value) periodPicker.value = getDefaultPeriod();

  const res = await apiFetch(`/api/admin/dashboard?period=${encodeURIComponent(periodPicker.value)}`);
  const data = await res.json();
  if (!res.ok) {
    showDashAlert(data.error || 'Veri alınamadı.', 'error');
    return;
  }

  document.getElementById('loginCard').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');

  document.getElementById('statApproved').textContent = data.stats.approved;
  document.getElementById('statPending').textContent = data.stats.pending;
  document.getElementById('statUnpaid').textContent = data.stats.unpaid + data.stats.rejected;
  document.getElementById('statTotal').textContent = data.stats.total;

  document.getElementById('setPaymentDay').value = data.settings.payment_day;
  document.getElementById('setAmount').value = data.settings.amount_per_person;
  document.getElementById('setIban').value = data.settings.iban_info;

  renderMembers(data.members);
}

function renderMembers(members) {
  const list = document.getElementById('membersList');
  if (!members.length) {
    list.innerHTML = '<p class="muted">Henüz hiç arkadaş eklemedin. Aşağıdan ekleyebilirsin.</p>';
    return;
  }

  list.innerHTML = members
    .map((m) => {
      const statusKey = m.payment ? m.payment.status : 'unpaid';
      const st = STATUS_MAP[statusKey] || STATUS_MAP.unpaid;
      const pushText = m.hasPush ? 'Bildirim Açık' : 'Bildirim Kapalı';
      const shareUrl = `${window.location.origin}/m/${m.token}`;

      return `
        <div class="member-row">
          <div>
            <strong>${escapeHtml(m.name)}</strong>
            <div class="muted" style="font-size:0.8rem;">
              ${pushText}
              ${m.payment?.note ? ` &bull; Not: ${escapeHtml(m.payment.note)}` : ''}
            </div>
          </div>
          <div class="member-actions">
            <span class="badge ${st.cls}">${st.label}</span>
            <button class="btn btn-sm" onclick="copyLink('${shareUrl}', this)">Linki Kopyala</button>
            ${
              m.payment
                ? `<button class="btn btn-primary btn-sm" onclick='openReceiptModal(${JSON.stringify(m.name)}, ${JSON.stringify(m.payment)})'>Dekontu Gör</button>`
                : ''
            }
            <button class="btn btn-sm" style="color:#f87171;" onclick="deleteMember(${m.id}, '${escapeHtml(m.name)}')">Sil</button>
          </div>
        </div>
      `;
    })
    .join('');
}

window.copyLink = async (url, btn) => {
  try {
    await navigator.clipboard.writeText(url);
    const old = btn.textContent;
    btn.textContent = 'Kopyalandı!';
    setTimeout(() => (btn.textContent = old), 1500);
  } catch {
    prompt('Arkadaşına göndereceğin link:', url);
  }
};

window.deleteMember = async (id, name) => {
  if (!confirm(`${name} adlı üyeyi ve tüm geçmişini silmek istiyor musun?`)) return;
  const res = await apiFetch(`/api/admin/members/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showDashAlert(`${name} silindi.`, 'info');
    loadDashboard();
  }
};

window.openReceiptModal = (memberName, payment) => {
  activePaymentId = payment.id;
  document.getElementById('modalTitle').textContent = `${memberName} - Dekont`;
  document.getElementById('modalMeta').textContent = `Dönem: ${payment.period} • Yükleme: ${payment.uploaded_at}`;
  document.getElementById('reviewNote').value = payment.note || '';

  const preview = document.getElementById('modalPreview');
  const fileUrl = `/api/receipts/${encodeURIComponent(payment.receipt_filename)}?pin=${encodeURIComponent(adminPin)}`;

  if (payment.receipt_filename.toLowerCase().endsWith('.pdf')) {
    preview.innerHTML = `<iframe src="${fileUrl}" style="height:400px; border:none;"></iframe>`;
  } else {
    preview.innerHTML = `<img src="${fileUrl}" alt="Dekont" />`;
  }

  document.getElementById('receiptModal').classList.add('open');
};

async function submitReview(status) {
  if (!activePaymentId) return;
  const note = document.getElementById('reviewNote').value.trim();
  const res = await apiFetch(`/api/admin/payments/${activePaymentId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note }),
  });

  if (res.ok) {
    document.getElementById('receiptModal').classList.remove('open');
    showDashAlert(status === 'approved' ? 'Dekont onaylandı!' : 'Dekont reddedildi.', status === 'approved' ? 'success' : 'error');
    loadDashboard();
  }
}

document.getElementById('closeModalBtn').addEventListener('click', () => {
  document.getElementById('receiptModal').classList.remove('open');
});

document.getElementById('approveBtn').addEventListener('click', () => submitReview('approved'));
document.getElementById('rejectBtn').addEventListener('click', () => submitReview('rejected'));
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('periodPicker').addEventListener('change', loadDashboard);

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = document.getElementById('pinInput').value.trim();
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });

  if (!res.ok) {
    errBox.textContent = 'PIN hatalı.';
    errBox.classList.remove('hidden');
    return;
  }

  adminPin = pin;
  sessionStorage.setItem('yt_admin_pin', pin);
  document.getElementById('pinInput').value = '';
  loadDashboard();
});

document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newMemberName');
  const name = input.value.trim();
  if (!name) return;

  const res = await apiFetch('/api/admin/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (res.ok) {
    input.value = '';
    showDashAlert(`${name} eklendi! "Linki Kopyala" ile kişisel sayfasını paylaşabilirsin.`, 'success');
    loadDashboard();
  }
});

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    payment_day: Number(document.getElementById('setPaymentDay').value),
    amount_per_person: document.getElementById('setAmount').value.trim(),
    iban_info: document.getElementById('setIban').value.trim(),
  };
  const newPin = document.getElementById('setNewPin').value.trim();
  if (newPin) payload.new_pin = newPin;

  const res = await apiFetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    showDashAlert(data.error || 'Ayarlar kaydedilemedi.', 'error');
    return;
  }

  if (newPin) {
    adminPin = newPin;
    sessionStorage.setItem('yt_admin_pin', newPin);
    document.getElementById('setNewPin').value = '';
  }

  showDashAlert('Ayarlar güncellendi.', 'success');
});

document.getElementById('notifyAllBtn').addEventListener('click', async () => {
  const res = await apiFetch('/api/admin/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: false }),
  });
  const data = await res.json();
  if (res.ok) {
    showDashAlert(
      `Bildirim gönderildi: ${data.sentCount} cihaza ulaştı (Atlanan onaylı/bekleyen: ${data.skipped.length}).`,
      'info'
    );
  } else {
    showDashAlert(data.error || 'Bildirim gönderilemedi.', 'error');
  }
});

if (adminPin) {
  loadDashboard().catch(() => {});
}
