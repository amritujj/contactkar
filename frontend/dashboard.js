const API = 'https://contactkar.onrender.com/api';

// ── Auth Guard ────────────────────────────────────────────────
const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';

// ── Greet User ────────────────────────────────────────────────
const greetEl = document.getElementById('user-greeting');
if (greetEl) greetEl.textContent = `Hi, ${localStorage.getItem('userName') || 'User'} 👋`;

// ── Logout ────────────────────────────────────────────────────
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.clear(); window.location.href = 'login.html'; });

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, color = 'green') {
  const colors = { green: '#10b981', red: '#ef4444', blue: '#2563eb', amber: '#f59e0b' };
  let el = document.getElementById('ck-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ck-toast';
    el.style.cssText = 'position:fixed;bottom:24px;right:20px;z-index:99999;padding:12px 20px;border-radius:12px;font-weight:700;font-size:.875rem;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.2);max-width:320px;transition:opacity .4s,transform .3s;opacity:0;';
    document.body.appendChild(el);
  }
  el.style.background = colors[color] || '#374151';
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; }, 3000);
}

// ── Load My Tags ──────────────────────────────────────────────
async function loadMyTags() {
  const container = document.getElementById('tags-container');
  const statsTotal  = document.getElementById('stat-total');
  const statsActive = document.getElementById('stat-active');
  const statsHidden = document.getElementById('stat-hidden');
  if (!container) return;

  container.innerHTML = `
    <div class="tag-loading-shimmer"></div>
    <div class="tag-loading-shimmer"></div>
    <div class="tag-loading-shimmer"></div>`;

  try {
    const res = await fetch(`${API}/tags/my`, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.href = 'login.html'; return; }

    const data = await res.json();
    const tags = Array.isArray(data) ? data : (data.tags || []);

    // Update stats
    const activeCount = tags.filter(t => t.is_contactable !== false).length;
    const hiddenCount = tags.length - activeCount;
    if (statsTotal)  statsTotal.textContent  = tags.length;
    if (statsActive) statsActive.textContent = activeCount;
    if (statsHidden) statsHidden.textContent = hiddenCount;

    if (tags.length === 0) {
      container.innerHTML = `
        <div class="empty-block">
          <div style="font-size:3rem;margin-bottom:.8rem;">🏷️</div>
          <h3>No Tags Yet</h3>
          <p style="margin:.4rem 0 1.2rem;font-size:.9rem;">You haven't purchased any tags yet.</p>
          <a href="vehicle.html" class="btn btn-primary" style="margin-right:8px;text-decoration:none;">🚗 Get Vehicle Tag</a>
          <a href="pet.html" class="btn btn-pet" style="text-decoration:none;">🐾 Get Pet Tag</a>
        </div>`;
      return;
    }

    container.innerHTML = tags.map(tag => renderTagCard(tag)).join('');

  } catch (err) {
    console.error('Failed to load tags:', err);
    container.innerHTML = `
      <div class="empty-block">
        <div style="font-size:3rem;margin-bottom:.8rem;">⚠️</div>
        <h3>Could not load tags</h3>
        <p style="margin:.4rem 0 1.2rem;font-size:.9rem;">Render server may be waking up. Wait 30s and retry.</p>
        <button class="btn btn-primary" onclick="loadMyTags()">🔄 Retry</button>
      </div>`;
  }
}

// ── Render Tag Card ───────────────────────────────────────────
function renderTagCard(tag) {
  const tagId    = tag.id || tag._id;
  const tagCode  = tag.tag_code || tag.tagCode;
  const isActive = tag.is_contactable !== false;
  const isPet    = tag.type === 'pet';
  const typeLabel = isPet ? 'Pet' : 'Vehicle';
  const typeColor = isPet ? '#ec4899' : '#2563eb';
  const statusColor = isActive ? '#10b981' : '#ef4444';
  const statusText  = isActive ? 'Active' : 'Hidden';
  const addedDate = tag.created_at ? new Date(tag.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : 'N/A';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent('https://contactkar.vercel.app/scan/' + tagCode)}`;

  return `
    <div class="tag-card" id="tag-card-${tagId}">
      <div class="tag-card-inner">

        <!-- QR -->
        <div class="tag-qr-wrap">
          <img src="${qrUrl}" alt="QR" class="tag-qr-img"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
          <div class="tag-qr-err" style="display:none;">❌<br>QR Error</div>
        </div>

        <!-- Info -->
        <div class="tag-info">
          <div class="tag-header">
            <span class="tag-code">${tagCode}</span>
            <span class="tag-badge" style="background:${typeColor}20;color:${typeColor};">${typeLabel}</span>
            <span class="tag-badge" style="background:${statusColor}20;color:${statusColor};">${statusText}</span>
          </div>
          ${tag.vehicle_number ? `<div class="tag-meta">🔢 Plate: <b>${tag.vehicle_number}</b></div>` : ''}
          ${tag.pet_name       ? `<div class="tag-meta">🐶 Pet: <b>${tag.pet_name}</b></div>`        : ''}
          ${tag.owner_name     ? `<div class="tag-meta">👤 Owner: <b>${tag.owner_name}</b></div>`    : ''}
          <div class="tag-meta">📅 Added: ${addedDate}</div>

          <!-- Action Buttons -->
          <div class="tag-actions">
            <button class="tag-btn tag-btn-blue" onclick="viewQR('${tagCode}')">View QR</button>
            <button class="tag-btn tag-btn-outline" onclick="copyTagLink('${tagCode}')">Copy Link</button>
            <button class="tag-btn ${isActive ? 'tag-btn-outline' : 'tag-btn-green'}" onclick="toggleTag('${tagId}', ${!isActive})">
              ${isActive ? 'Hide' : 'Show'}
            </button>
            <button class="tag-btn tag-btn-danger" onclick="deleteTag('${tagId}', '${tagCode}')">🗑️ Delete</button>
          </div>
        </div>

      </div>
    </div>`;
}

// ── View QR Modal ─────────────────────────────────────────────
function viewQR(tagCode) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent('https://contactkar.vercel.app/scan/' + tagCode)}`;
  let modal = document.getElementById('qr-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qr-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;padding:2rem;text-align:center;max-width:320px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.25);">
        <div style="font-weight:800;font-size:1.1rem;margin-bottom:1rem;" id="qr-modal-title">QR Code</div>
        <img id="qr-modal-img" src="" alt="QR" style="border-radius:10px;border:1.5px solid #e5e7eb;padding:6px;width:260px;height:260px;" />
        <div style="margin-top:1rem;display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;">
          <a id="qr-modal-dl" href="" download class="tag-btn tag-btn-outline" style="text-decoration:none;">⬇️ Download</a>
          <button onclick="document.getElementById('qr-modal').remove()" class="tag-btn tag-btn-danger">✕ Close</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
  document.getElementById('qr-modal-title').textContent = `QR — ${tagCode}`;
  document.getElementById('qr-modal-img').src = qrUrl;
  document.getElementById('qr-modal-dl').href = qrUrl;
  document.getElementById('qr-modal-dl').download = `qr-${tagCode}.png`;
}

// ── Copy Tag Scan Link ────────────────────────────────────────
function copyTagLink(tagCode) {
  const link = `https://contactkar.vercel.app/scan/${tagCode}`;
  navigator.clipboard.writeText(link).then(() => showToast('🔗 Link copied!', 'blue')).catch(() => showToast('Copy failed', 'red'));
}

// ── Toggle Tag Active/Hidden ──────────────────────────────────
async function toggleTag(tagId, newStatus) {
  try {
    const res = await fetch(`${API}/tags/${tagId}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ isContactable: newStatus })
    });
    const data = await res.json();
    if (data.success) { showToast(newStatus ? '✅ Tag is now Active' : '🔕 Tag is now Hidden', newStatus ? 'green' : 'amber'); loadMyTags(); }
    else showToast('Failed: ' + (data.error || 'Unknown error'), 'red');
  } catch (e) { showToast('Server error', 'red'); }
}

// ── Delete Tag ────────────────────────────────────────────────
async function deleteTag(tagId, tagCode) {
  if (!confirm(`🗑️ Delete tag "${tagCode}"?\n\nThis permanently removes it from the system and cannot be undone.`)) return;

  const card = document.getElementById(`tag-card-${tagId}`);
  if (card) card.style.opacity = '0.4';

  try {
    const res = await fetch(`${API}/tags/${tagId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      if (card) {
        card.style.transition = 'all .3s ease';
        card.style.transform  = 'scale(0.95)';
        card.style.opacity    = '0';
        card.style.maxHeight  = '0';
        card.style.marginBottom = '0';
        setTimeout(() => { card.remove(); loadMyTags(); }, 320);
      }
      showToast(`🗑️ Tag ${tagCode} deleted`, 'red');
    } else {
      if (card) card.style.opacity = '1';
      showToast('Delete failed: ' + (data.error || 'Server error'), 'red');
    }
  } catch (e) {
    if (card) card.style.opacity = '1';
    showToast('Network error. Check Render status.', 'red');
  }
}

// ── Order Calculator ──────────────────────────────────────────
function calculateTotal() {
  const v = parseInt(document.getElementById('vehicleQty')?.value) || 0;
  const p = parseInt(document.getElementById('petQty')?.value) || 0;
  const total = v + p;
  const free  = total >= 5 ? 2 : (total >= 3 ? 1 : 0);
  const cost  = Math.max(0, total - free) * 149;
  const td = document.getElementById('totalTagsDisplay');
  const cd = document.getElementById('costDisplay');
  const sd = document.getElementById('savingsDisplay');
  if (td) td.innerText = total;
  if (cd) cd.innerText = '₹' + cost;
  if (sd) sd.innerText = free > 0 ? `(Save ₹${free * 149}!)` : '';
}

// ── Place Order ───────────────────────────────────────────────
async function placeOrder() {
  const v       = parseInt(document.getElementById('vehicleQty')?.value) || 0;
  const p       = parseInt(document.getElementById('petQty')?.value) || 0;
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
    if (data.success) { alert('✅ Order placed! Your tags will be delivered soon.'); window.location.href = 'dashboard.html'; }
    else alert('Error: ' + (data.error || 'Something went wrong.'));
  } catch (e) { alert('Server error. Make sure Render backend is running!'); }
}

// ── Confirm Account Delete ────────────────────────────────────
function confirmDelete() {
  if (confirm('⚠️ Permanently delete your account and ALL tags?\nThis CANNOT be undone.'))
    showToast('For account deletion, email support@contactkar.in', 'blue');
}

// ── Init ──────────────────────────────────────────────────────
loadMyTags();