const API = 'https://contactkar.onrender.com/api';

// ── Auth Guard ────────────────────────────────────────────────
const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';

// ── Greet User ────────────────────────────────────────────────
const userName = localStorage.getItem('userName') || 'User';
const greetEl = document.getElementById('user-greeting');
if (greetEl) greetEl.textContent = `Hi, ${userName} 👋`;

// ── Logout ────────────────────────────────────────────────────
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
  });
}

// ── Order Calculator (for order page if present) ──────────────
function calculateTotal() {
  const v = parseInt(document.getElementById('vehicleQty')?.value) || 0;
  const p = parseInt(document.getElementById('petQty')?.value) || 0;
  const total = v + p;
  const free = total >= 5 ? 2 : total >= 3 ? 1 : 0;
  const cost = Math.max(0, total - free) * 149;
  const tdEl = document.getElementById('totalTagsDisplay');
  const cdEl = document.getElementById('costDisplay');
  const sdEl = document.getElementById('savingsDisplay');
  if (tdEl) tdEl.innerText = total;
  if (cdEl) cdEl.innerText = cost;
  if (sdEl) sdEl.innerText = free > 0 ? `Save ₹${free * 149}!` : '';
}

// ── Place Order ───────────────────────────────────────────────
async function placeOrder() {
  const v = parseInt(document.getElementById('vehicleQty')?.value) || 0;
  const p = parseInt(document.getElementById('petQty')?.value) || 0;
  const address = document.getElementById('address')?.value.trim();
  const city    = document.getElementById('city')?.value.trim();
  const state   = document.getElementById('state')?.value.trim();
  const pincode = document.getElementById('pincode')?.value.trim();

  if (v + p === 0) { alert('Please add at least 1 tag.'); return; }
  if (!address || !city || !state || !pincode) { alert('Please fill in your full shipping address.'); return; }

  try {
    const res = await fetch(`${API}/orders/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ vehicleQty: v, petQty: p, address, city, state, pincode })
    });
    const data = await res.json();
    if (data.success) {
      alert('Order placed! Your tags will be delivered to your door.');
      window.location.href = 'dashboard.html';
    } else {
      alert('Error: ' + (data.error || 'Something went wrong.'));
    }
  } catch (e) {
    alert('Server error. Make sure your Render backend is running!');
  }
}

// ── Load My Tags ──────────────────────────────────────────────
async function loadMyTags() {
  const container = document.getElementById('tags-container');
  if (!container) return;

  container.innerHTML = `
    <div class="tag-loading-shimmer"></div>
    <div class="tag-loading-shimmer"></div>`;

  try {
    const res = await fetch(`${API}/tags/my`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.clear();
      window.location.href = 'login.html';
      return;
    }

    const data = await res.json();
    const tags = Array.isArray(data) ? data : (data.tags || []);

    if (tags.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="ei">🏷️</div>
          <h3>No Tags Yet</h3>
          <p>You haven't purchased any tags yet.</p>
          <a href="vehicle.html" class="btn btn-primary" style="margin-right:8px">Get Vehicle Tag</a>
          <a href="pet.html" class="btn btn-pet">Get Pet Tag</a>
        </div>`;
      return;
    }

    container.innerHTML = tags.map(tag => renderTagCard(tag)).join('');

  } catch (err) {
    console.error('Failed to load tags:', err);
    container.innerHTML = `
      <div class="empty">
        <div class="ei">⚠️</div>
        <h3>Could not load tags</h3>
        <p>Render may be starting up. Wait 30s and retry.</p>
        <button class="btn-outline" onclick="loadMyTags()">🔄 Retry</button>
      </div>`;
  }
}

// ── Render Single Tag Card ────────────────────────────────────
function renderTagCard(tag) {
  const tagId    = tag._id || tag.tagCode;
  const isActive = tag.isContactable !== false;
  const isPet    = tag.type === 'pet';
  const typeIcon = isPet ? '🐾' : '🚗';
  const typeLabel = isPet ? 'Pet Tag' : 'Vehicle Tag';
  const badgeClass = isActive ? 'badge-green' : 'badge-red';
  const badgeText  = isActive ? '✅ Active' : '🔴 Inactive';

  // QR code URL using a free QR API (no extra library needed)
  const scanUrl = `https://contactkar.onrender.com/scan/${tag.tagCode}`;
  const qrUrl   = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(scanUrl)}`;

  return `
    <div class="card anim" id="tag-card-${tagId}" style="margin-bottom:1.2rem;">

      <!-- Header Row -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.8rem;">
        <div>
          <div style="font-weight:800;font-size:1.05rem;">${typeIcon} ${typeLabel}</div>
          <div style="font-size:.82rem;color:#6b7280;margin-top:.2rem;">
            Code: <b>${tag.tagCode || tagId}</b>
          </div>
          ${tag.plateNumber ? `<div style="font-size:.82rem;color:#6b7280;">🔢 Plate: <b>${tag.plateNumber}</b></div>` : ''}
          ${tag.petName     ? `<div style="font-size:.82rem;color:#6b7280;">🐶 Pet: <b>${tag.petName}</b></div>`    : ''}
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>

      <hr style="border:none;border-top:1px solid #f3f4f6;margin:.6rem 0 1rem;">

      <!-- QR Code Block -->
      <div style="text-align:center;margin-bottom:1rem;">
        <p style="font-size:.78rem;color:#6b7280;margin-bottom:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">QR Code (Temporary)</p>
        <img
          src="${qrUrl}"
          alt="QR Code for ${tag.tagCode}"
          style="border-radius:10px;border:1.5px solid #e5e7eb;padding:6px;background:#fff;width:160px;height:160px;"
          onerror="this.style.display='none';this.nextElementSibling.style.display='block';"
        />
        <div style="display:none;color:#ef4444;font-size:.85rem;margin-top:.4rem;">⚠️ QR failed to load</div>
        <div style="margin-top:.6rem;">
          <a
            href="${qrUrl}"
            download="qr-${tag.tagCode}.png"
            class="btn-outline"
            style="font-size:.8rem;padding:.35rem .9rem;margin-right:.4rem;"
          >⬇️ Download QR</a>
          <!-- DELETE QR BUTTON (Temporary) -->
          <button
            class="btn-danger-sm"
            onclick="deleteTag('${tagId}', '${tag.tagCode}')"
            style="font-size:.8rem;"
          >🗑️ Delete Tag & QR</button>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid #f3f4f6;margin:.4rem 0 .8rem;">

      <!-- Action Row -->
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
        <button
          class="btn-outline"
          onclick="toggleTagPrivacy('${tagId}', ${!isActive})"
          style="font-size:.85rem;"
        >${isActive ? '🔕 Disable Tag' : '🔔 Enable Tag'}</button>
      </div>

    </div>`;
}

// ── Toggle Tag Active / Inactive ──────────────────────────────
async function toggleTagPrivacy(tagId, newStatus) {
  try {
    const res = await fetch(`${API}/tags/${tagId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ isContactable: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadMyTags();
    } else {
      alert('Failed to update tag: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Server error while toggling tag.');
  }
}

// ── DELETE Tag + QR from Backend ─────────────────────────────
async function deleteTag(tagId, tagCode) {
  const confirmed = confirm(
    `⚠️ Delete Tag "${tagCode}"?\n\nThis will permanently remove the tag and its QR code from the system. This action CANNOT be undone.`
  );
  if (!confirmed) return;

  // Visually disable the card immediately
  const card = document.getElementById(`tag-card-${tagId}`);
  if (card) card.style.opacity = '0.4';

  try {
    const res = await fetch(`${API}/tags/${tagId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // Smooth remove animation
      if (card) {
        card.style.transition = 'all 0.35s ease';
        card.style.transform  = 'scale(0.95)';
        card.style.opacity    = '0';
        setTimeout(() => card.remove(), 350);
      }
      showToast('🗑️ Tag deleted successfully', 'red');

      // If no tags left, reload to show empty state
      setTimeout(() => {
        const container = document.getElementById('tags-container');
        if (container && container.querySelectorAll('.card').length === 0) {
          loadMyTags();
        }
      }, 400);

    } else {
      if (card) card.style.opacity = '1';
      alert('Failed to delete tag: ' + (data.error || 'Server error'));
    }
  } catch (e) {
    if (card) card.style.opacity = '1';
    alert('Network error. Make sure Render backend is running.');
  }
}

// ── Toast Notification ────────────────────────────────────────
function showToast(msg, color = 'green') {
  const colors = { green: '#10b981', red: '#ef4444', blue: '#2563eb' };
  let el = document.getElementById('ck-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ck-toast';
    el.style.cssText = `
      position:fixed;bottom:24px;right:20px;z-index:99999;
      padding:12px 20px;border-radius:12px;font-weight:700;
      font-size:.875rem;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.2);
      max-width:300px;transition:opacity .4s,transform .3s;
    `;
    document.body.appendChild(el);
  }
  el.style.background = colors[color] || '#374151';
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
  }, 3000);
}

// ── Confirm Account Delete ────────────────────────────────────
function confirmDelete() {
  if (confirm('This will permanently delete your account and ALL your tags. CANNOT be undone. Are you absolutely sure?')) {
    showToast('For account deletion, contact support@contactkar.in', 'blue');
  }
}

// ── Init ──────────────────────────────────────────────────────
loadMyTags();
