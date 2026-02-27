const API = 'https://contactkar.onrender.com/api';

// ── Auth Guard ─────────────────────────────────────────────────────
const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';

// ── Greet User ─────────────────────────────────────────────────────
const greetEl = document.getElementById('user-greeting');
if (greetEl) greetEl.textContent = 'Hi, ' + (localStorage.getItem('userName') || 'User') + ' \u{1F44B}';

// ── Logout ─────────────────────────────────────────────────────────
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.clear(); window.location.href = 'login.html'; });

// ── Toast ──────────────────────────────────────────────────────────
function showToast(msg, color) {
  color = color || 'green';
  var colors = { green: '#10b981', red: '#ef4444', blue: '#2563eb', amber: '#f59e0b' };
  var el = document.getElementById('ck-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ck-toast';
    el.style.cssText = 'position:fixed;bottom:24px;right:20px;z-index:99999;padding:12px 20px;border-radius:12px;font-weight:700;font-size:.875rem;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.2);max-width:320px;transition:opacity .4s,transform .3s;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.style.background = colors[color] || '#374151';
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; }, 3000);
}

// ── Load My Tags ───────────────────────────────────────────────────
function loadMyTags() {
  var container = document.getElementById('tags-container');
  var statTotal  = document.getElementById('stat-total');
  var statActive = document.getElementById('stat-active');
  var statHidden = document.getElementById('stat-hidden');
  if (!container) return;

  container.innerHTML =
    '<div class="tag-loading-shimmer"></div>' +
    '<div class="tag-loading-shimmer"></div>' +
    '<div class="tag-loading-shimmer"></div>';

  fetch(API + '/tags/my', {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  })
  .then(function(res) {
    if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.href = 'login.html'; return; }
    return res.json();
  })
  .then(function(data) {
    if (!data) return;
    var tags = Array.isArray(data) ? data : (data.tags || []);
    var activeCount = tags.filter(function(t) { return t.is_contactable !== false; }).length;
    var hiddenCount = tags.length - activeCount;
    if (statTotal)  statTotal.textContent  = tags.length;
    if (statActive) statActive.textContent = activeCount;
    if (statHidden) statHidden.textContent = hiddenCount;

    if (tags.length === 0) {
      container.innerHTML =
        '<div class="empty-block">' +
          '<div style="font-size:3rem;margin-bottom:.8rem;">\uD83C\uDFF7\uFE0F</div>' +
          '<h3>No Tags Yet</h3>' +
          '<p style="margin:.4rem 0 1.2rem;font-size:.9rem;">You haven\'t purchased any tags yet.</p>' +
          '<a href="vehicle.html" class="btn btn-primary" style="margin-right:8px;text-decoration:none;">\uD83D\uDE97 Get Vehicle Tag</a>' +
          '<a href="pet.html" class="btn btn-pet" style="text-decoration:none;">\uD83D\uDC3E Get Pet Tag</a>' +
        '</div>';
      return;
    }
    container.innerHTML = tags.map(renderTagCard).join('');
  })
  .catch(function() {
    container.innerHTML =
      '<div class="empty-block">' +
        '<div style="font-size:3rem;margin-bottom:.8rem;">\u26A0\uFE0F</div>' +
        '<h3>Could not load tags</h3>' +
        '<p style="margin:.4rem 0 1.2rem;font-size:.9rem;">Render server may be waking up. Wait 30s and retry.</p>' +
        '<button class="btn btn-primary" onclick="loadMyTags()">\uD83D\uDD04 Retry</button>' +
      '</div>';
  });
}

// ── Render Tag Card ────────────────────────────────────────────────
function renderTagCard(tag) {
  var tagId    = tag.id || tag._id;
  var tagCode  = tag.tag_code || tag.tagCode || '';
  var isActive = tag.is_contactable !== false;
  var isPet    = tag.type === 'pet';
  var typeLabel = isPet ? 'Pet' : 'Vehicle';
  var typeColor = isPet ? '#ec4899' : '#2563eb';
  var statusColor = isActive ? '#10b981' : '#ef4444';
  var statusText  = isActive ? 'Active' : 'Hidden';
  var addedDate   = tag.created_at
    ? new Date(tag.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : 'N/A';
  var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' +
    encodeURIComponent('https://contactkar.vercel.app/scan/' + tagCode);

  return (
    '<div class="tag-card" id="tag-card-' + tagId + '">' +
      '<div class="tag-card-inner">' +

        // QR image
        '<div class="tag-qr-wrap">' +
          '<img src="' + qrUrl + '" alt="QR" class="tag-qr-img"' +
          ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';"/>' +
          '<div class="tag-qr-err" style="display:none;">\u274C<br>QR Error</div>' +
        '</div>' +

        // Info block
        '<div class="tag-info">' +
          '<div class="tag-header">' +
            '<span class="tag-code">' + tagCode + '</span>' +
            '<span class="tag-badge" style="background:' + typeColor + '20;color:' + typeColor + ';">' + typeLabel + '</span>' +
            '<span class="tag-badge" style="background:' + statusColor + '20;color:' + statusColor + ';">' + statusText + '</span>' +
          '</div>' +
          (tag.vehicle_number ? '<div class="tag-meta">\uD83D\uDD22 Plate: <b>' + tag.vehicle_number + '</b></div>' : '') +
          (tag.pet_name       ? '<div class="tag-meta">\uD83D\uDC36 Pet: <b>' + tag.pet_name + '</b></div>'         : '') +
          (tag.owner_name     ? '<div class="tag-meta">\uD83D\uDC64 Owner: <b>' + tag.owner_name + '</b></div>'     : '') +
          (tag.emergency_contact ? '<div class="tag-meta">\uD83D\uDEA8 Emergency: <b>' + tag.emergency_contact + '</b></div>' : '') +
          '<div class="tag-meta">\uD83D\uDCC5 Added: ' + addedDate + '</div>' +

          // Buttons — including DELETE
          '<div class="tag-actions">' +
            '<button class="tag-btn tag-btn-blue" onclick="viewQR(\'' + tagCode + '\')">View QR</button>' +
            '<button class="tag-btn tag-btn-outline" onclick="copyTagLink(\'' + tagCode + '\')">Copy Link</button>' +
            '<button class="tag-btn ' + (isActive ? 'tag-btn-amber' : 'tag-btn-green') + '" onclick="toggleTag(\'' + tagId + '\', ' + !isActive + ')">' +
              (isActive ? 'Hide' : 'Show') +
            '</button>' +
            '<button class="tag-btn tag-btn-danger" onclick="deleteTag(\'' + tagId + '\', \'' + tagCode + '\')">\uD83D\uDDD1\uFE0F Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

// ── View QR Modal ──────────────────────────────────────────────────
function viewQR(tagCode) {
  var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' +
    encodeURIComponent('https://contactkar.vercel.app/scan/' + tagCode);
  var old = document.getElementById('qr-modal');
  if (old) old.remove();
  var modal = document.createElement('div');
  modal.id = 'qr-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:18px;padding:2rem;text-align:center;max-width:320px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +
      '<div style="font-weight:800;font-size:1.05rem;margin-bottom:1rem;">QR — ' + tagCode + '</div>' +
      '<img src="' + qrUrl + '" style="border-radius:10px;border:1.5px solid #e5e7eb;padding:6px;width:260px;height:260px;" />' +
      '<div style="margin-top:1rem;display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;">' +
        '<a href="' + qrUrl + '" download="qr-' + tagCode + '.png" class="tag-btn tag-btn-outline" style="text-decoration:none;">\u2B07\uFE0F Download</a>' +
        '<button onclick="document.getElementById(\'qr-modal\').remove()" class="tag-btn tag-btn-danger">\u2715 Close</button>' +
      '</div>' +
    '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ── Copy Tag Link ──────────────────────────────────────────────────
function copyTagLink(tagCode) {
  var link = 'https://contactkar.vercel.app/scan/' + tagCode;
  navigator.clipboard.writeText(link)
    .then(function() { showToast('\uD83D\uDD17 Link copied!', 'blue'); })
    .catch(function() { showToast('Copy failed', 'red'); });
}

// ── Toggle Tag ─────────────────────────────────────────────────────
function toggleTag(tagId, newStatus) {
  fetch(API + '/tags/' + tagId + '/toggle', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ isContactable: newStatus })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.success) {
      showToast(newStatus ? '\u2705 Tag is now Active' : '\uD83D\uDD15 Tag is now Hidden', newStatus ? 'green' : 'amber');
      loadMyTags();
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'red');
    }
  })
  .catch(function() { showToast('Server error', 'red'); });
}

// ── Delete Tag ─────────────────────────────────────────────────────
function deleteTag(tagId, tagCode) {
  if (!confirm('\uD83D\uDDD1\uFE0F Delete tag "' + tagCode + '"?\n\nThis permanently removes it from the system and cannot be undone.')) return;

  var card = document.getElementById('tag-card-' + tagId);
  if (card) card.style.opacity = '0.4';

  fetch(API + '/tags/' + tagId, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  })
  .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
  .then(function(result) {
    if (result.ok && result.data.success) {
      if (card) {
        card.style.transition = 'all .3s ease';
        card.style.transform  = 'scale(0.95)';
        card.style.opacity    = '0';
        card.style.maxHeight  = '0';
        card.style.marginBottom = '0';
        setTimeout(function() { card.remove(); loadMyTags(); }, 320);
      }
      showToast('\uD83D\uDDD1\uFE0F Tag ' + tagCode + ' deleted', 'red');
    } else {
      if (card) card.style.opacity = '1';
      showToast('Delete failed: ' + (result.data.error || 'Server error'), 'red');
    }
  })
  .catch(function() {
    if (card) card.style.opacity = '1';
    showToast('Network error. Check Render status.', 'red');
  });
}

// ── Order Calculator ───────────────────────────────────────────────
function calculateTotal() {
  var v = parseInt(document.getElementById('vehicleQty') && document.getElementById('vehicleQty').value) || 0;
  var p = parseInt(document.getElementById('petQty') && document.getElementById('petQty').value) || 0;
  var total = v + p;
  var free  = total >= 5 ? 2 : (total >= 3 ? 1 : 0);
  var cost  = Math.max(0, total - free) * 149;
  var td = document.getElementById('totalTagsDisplay');
  var cd = document.getElementById('costDisplay');
  var sd = document.getElementById('savingsDisplay');
  if (td) td.innerText = total;
  if (cd) cd.innerText = '\u20B9' + cost;
  if (sd) sd.innerText = free > 0 ? '(Save \u20B9' + (free * 149) + '!)' : '';
}

// ── Confirm Account Delete ─────────────────────────────────────────
function confirmDelete() {
  if (confirm('\u26A0\uFE0F Permanently delete your account and ALL tags?\nThis CANNOT be undone.'))
    showToast('For account deletion, email support@contactkar.in', 'blue');
}

// ── Init ───────────────────────────────────────────────────────────
loadMyTags();