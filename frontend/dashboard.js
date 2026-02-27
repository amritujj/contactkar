const API = 'https://contactkar.onrender.com/api';

// ── Auth guard
if (!localStorage.getItem('token')) window.location.href = 'login.html';

// ── Toast helper
function showToast(msg, type) {
  var bg = { green:'#10b981', red:'#ef4444', blue:'#2563eb', amber:'#f59e0b' };
  var el = document.getElementById('ck-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ck-toast';
    el.style.cssText = 'position:fixed;bottom:24px;right:20px;z-index:99999;padding:12px 22px;border-radius:12px;font-weight:700;font-size:.875rem;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.2);max-width:320px;transition:opacity .4s,transform .3s;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.style.background = bg[type] || '#374151';
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.style.opacity='0'; el.style.transform='translateY(8px)'; }, 3000);
}

// ── Load and render all tags
function loadMyTags() {
  var wrap = document.getElementById('tags-container');
  var sTotal  = document.getElementById('stat-total');
  var sActive = document.getElementById('stat-active');
  var sHidden = document.getElementById('stat-hidden');
  if (!wrap) return;

  wrap.innerHTML = '<div class="tag-shimmer"></div><div class="tag-shimmer"></div><div class="tag-shimmer"></div>';

  fetch(API + '/tags/my', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } })
    .then(function(r) {
      if (r.status === 401) { localStorage.clear(); window.location.href = 'login.html'; }
      return r.json();
    })
    .then(function(data) {
      var tags = Array.isArray(data) ? data : (data.tags || []);
      var active = tags.filter(function(t){ return t.is_contactable !== false; }).length;
      if (sTotal)  sTotal.textContent  = tags.length;
      if (sActive) sActive.textContent = active;
      if (sHidden) sHidden.textContent = tags.length - active;

      if (!tags.length) {
        wrap.innerHTML =
          '<div style="border:2px dashed #e5e7eb;border-radius:14px;padding:2.5rem;text-align:center;color:#6b7280;background:#fff;">' +
          '<div style="font-size:3rem;margin-bottom:.8rem;">&#127991;</div>' +
          '<h3 style="color:#111827;margin-bottom:.5rem;">No Tags Yet</h3>' +
          '<p style="margin-bottom:1.2rem;font-size:.9rem;">Purchase a plan to get your first tag.</p>' +
          '<a href="vehicle.html" style="background:#2563eb;color:#fff;padding:.6rem 1.2rem;border-radius:8px;font-weight:700;text-decoration:none;margin-right:8px;">&#128663; Vehicle Tag</a>' +
          '<a href="pet.html"     style="background:#ec4899;color:#fff;padding:.6rem 1.2rem;border-radius:8px;font-weight:700;text-decoration:none;">&#128062; Pet Tag</a></div>';
        return;
      }
      wrap.innerHTML = tags.map(renderCard).join('');
    })
    .catch(function() {
      wrap.innerHTML =
        '<div style="border:2px dashed #e5e7eb;border-radius:14px;padding:2.5rem;text-align:center;color:#6b7280;background:#fff;">' +
        '<div style="font-size:2.5rem;margin-bottom:.8rem;">&#9888;&#65039;</div>' +
        '<h3 style="color:#111827;">Could not load tags</h3>' +
        '<p style="margin:.5rem 0 1rem;font-size:.9rem;">Server may be starting up. Wait 30s then retry.</p>' +
        '<button onclick="loadMyTags()" style="background:#2563eb;color:#fff;border:none;padding:.6rem 1.4rem;border-radius:8px;font-weight:700;cursor:pointer;">&#128260; Retry</button></div>';
    });
}

// ── Build one tag card HTML string
function renderCard(tag) {
  var id      = tag.id;
  var code    = tag.tag_code || '';
  var active  = tag.is_contactable !== false;
  var isPet   = tag.type === 'pet';
  var typeClr = isPet ? '#ec4899' : '#2563eb';
  var stClr   = active ? '#10b981' : '#ef4444';
  var stTxt   = active ? 'Active' : 'Hidden';
  var date    = tag.created_at ? new Date(tag.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '';
  var qr      = 'https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=' + encodeURIComponent('https://contactkar.vercel.app/scan/' + code);

  var meta = '';
  if (tag.vehicle_number) meta += '<div style="font-size:.82rem;color:#6b7280;margin-bottom:.2rem;">&#128290; <b>' + tag.vehicle_number + '</b></div>';
  if (tag.pet_name)       meta += '<div style="font-size:.82rem;color:#6b7280;margin-bottom:.2rem;">&#128054; <b>' + tag.pet_name + '</b></div>';
  if (tag.owner_name)     meta += '<div style="font-size:.82rem;color:#6b7280;margin-bottom:.2rem;">&#128100; <b>' + tag.owner_name + '</b></div>';
  if (tag.emergency_contact) meta += '<div style="font-size:.82rem;color:#6b7280;margin-bottom:.2rem;">&#128680; <b>' + tag.emergency_contact + '</b></div>';
  if (date)               meta += '<div style="font-size:.82rem;color:#9ca3af;">&#128197; Added: ' + date + '</div>';

  var toggleLabel = active ? 'Hide' : 'Show';
  var toggleStyle = active
    ? 'background:#fff;color:#d97706;border:1.5px solid #fcd34d;'
    : 'background:#10b981;color:#fff;border:none;';

  return (
    '<div id="tc-' + id + '" style="background:#fff;border:1.5px solid #e5e7eb;border-radius:16px;margin-bottom:1rem;box-shadow:0 2px 8px rgba(0,0,0,.04);transition:box-shadow .25s,transform .25s;overflow:hidden;">' +
      '<div style="display:flex;gap:1rem;padding:1.2rem 1.4rem;align-items:flex-start;">' +

        // QR
        '<div style="flex-shrink:0;width:90px;height:90px;border:1.5px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#f9fafb;display:flex;align-items:center;justify-content:center;">' +
          '<img src="' + qr + '" width="90" height="90" style="object-fit:contain;" onerror="this.parentElement.innerHTML='&#10060;'"/>' +
        '</div>' +

        // Info
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin-bottom:.45rem;">' +
            '<span style="font-size:.95rem;font-weight:800;color:#111827;">' + code + '</span>' +
            '<span style="font-size:.7rem;font-weight:700;padding:2px 9px;border-radius:20px;background:' + typeClr + '20;color:' + typeClr + ';">' + (isPet ? 'Pet' : 'Vehicle') + '</span>' +
            '<span style="font-size:.7rem;font-weight:700;padding:2px 9px;border-radius:20px;background:' + stClr + '20;color:' + stClr + ';">' + stTxt + '</span>' +
          '</div>' +
          meta +
          // ── BUTTONS — View QR | Copy Link | Hide/Show | DELETE
          '<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.7rem;">' +
            '<button onclick="viewQR('' + code + '')" style="padding:.35rem .8rem;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;border:none;background:#2563eb;color:#fff;font-family:inherit;">View QR</button>' +
            '<button onclick="copyLink('' + code + '')" style="padding:.35rem .8rem;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;background:#fff;color:#374151;border:1.5px solid #d1d5db;font-family:inherit;">Copy Link</button>' +
            '<button onclick="toggleTag('' + id + '',' + !active + ')" style="padding:.35rem .8rem;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit;' + toggleStyle + '">' + toggleLabel + '</button>' +
            '<button onclick="deleteTag('' + id + '','' + code + '')" style="padding:.35rem .8rem;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;background:#fff;color:#ef4444;border:1.5px solid #fca5a5;font-family:inherit;">&#128465; Delete</button>' +
          '</div>' +
        '</div>' +

      '</div>' +
    '</div>'
  );
}

// ── View QR in modal
function viewQR(code) {
  var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent('https://contactkar.vercel.app/scan/' + code);
  var old = document.getElementById('qr-modal');
  if (old) old.remove();
  var m = document.createElement('div');
  m.id = 'qr-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
  m.innerHTML =
    '<div style="background:#fff;border-radius:18px;padding:2rem;text-align:center;max-width:320px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +
      '<div style="font-weight:800;margin-bottom:1rem;">QR &mdash; ' + code + '</div>' +
      '<img src="' + qr + '" style="width:260px;height:260px;border:1.5px solid #e5e7eb;border-radius:10px;padding:6px;"/>' +
      '<div style="margin-top:1rem;display:flex;gap:.6rem;justify-content:center;">' +
        '<a href="' + qr + '" download="qr-' + code + '.png" style="padding:.4rem .9rem;border-radius:8px;font-size:.82rem;font-weight:700;background:#fff;color:#374151;border:1.5px solid #d1d5db;text-decoration:none;">&#11015; Download</a>' +
        '<button onclick="document.getElementById('qr-modal').remove()" style="padding:.4rem .9rem;border-radius:8px;font-size:.82rem;font-weight:700;background:#fff;color:#ef4444;border:1.5px solid #fca5a5;cursor:pointer;font-family:inherit;">&#10005; Close</button>' +
      '</div>' +
    '</div>';
  m.addEventListener('click', function(e){ if(e.target===m) m.remove(); });
  document.body.appendChild(m);
}

// ── Copy scan link
function copyLink(code) {
  navigator.clipboard.writeText('https://contactkar.vercel.app/scan/' + code)
    .then(function(){ showToast('Link copied!', 'blue'); })
    .catch(function(){ showToast('Copy failed', 'red'); });
}

// ── Toggle active / hidden
function toggleTag(id, newVal) {
  fetch(API + '/tags/' + id + '/toggle', {
    method: 'PUT',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + localStorage.getItem('token') },
    body: JSON.stringify({ isContactable: newVal })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.success) { showToast(newVal ? 'Tag is now Active' : 'Tag is now Hidden', newVal ? 'green' : 'amber'); loadMyTags(); }
    else showToast('Error: ' + (d.error||'failed'), 'red');
  })
  .catch(function(){ showToast('Network error', 'red'); });
}

// ── Delete tag permanently
function deleteTag(id, code) {
  if (!confirm('Delete tag "' + code + '"?\nThis cannot be undone.')) return;
  var card = document.getElementById('tc-' + id);
  if (card) card.style.opacity = '0.4';

  fetch(API + '/tags/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
  })
  .then(function(r){ return r.json().then(function(d){ return { ok:r.ok, d:d }; }); })
  .then(function(res){
    if (res.ok && res.d.success) {
      showToast('Tag ' + code + ' deleted', 'red');
      if (card) {
        card.style.transition = 'all .3s';
        card.style.transform  = 'scaleY(0)';
        card.style.maxHeight  = '0';
        card.style.marginBottom = '0';
        setTimeout(function(){ card.remove(); loadMyTags(); }, 300);
      }
    } else {
      if (card) card.style.opacity = '1';
      showToast('Delete failed: ' + (res.d.error||'error'), 'red');
    }
  })
  .catch(function(){
    if (card) card.style.opacity = '1';
    showToast('Network error', 'red');
  });
}

// ── Shimmer CSS injection (so no extra CSS file needed)
(function(){
  var s = document.createElement('style');
  s.textContent = '.tag-shimmer{background:linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%);background-size:200% 100%;animation:ck-shimmer 1.4s infinite;border-radius:16px;height:110px;margin-bottom:1rem;}@keyframes ck-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
  document.head.appendChild(s);
})();

// ── Logout
var logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', function(){ localStorage.clear(); window.location.href='login.html'; });

// ── Init
loadMyTags();