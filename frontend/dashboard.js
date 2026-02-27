const API = 'https://contactkar.onrender.com/api';

// ── Auth Guard ──────────────────────────────────────────────
const token = localStorage.getItem('token');
if (!token) window.location.href = 'login.html';

// ── Greet User ──────────────────────────────────────────────
const userName = localStorage.getItem('userName') || 'User';
const greetEl = document.getElementById('user-greeting');
if (greetEl) greetEl.textContent = `Hi, ${userName} 👋`;

// ── Logout ───────────────────────────────────────────────────
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
  });
}

// ── Load Tags (ONLY the logged-in user's tags) ───────────────
async function loadMyTags() {
  const container = document.getElementById('tags-container');
  if (!container) return;

  // Show shimmer while loading
  container.innerHTML = `<div class="tag-loading-shimmer"></div>
                          <div class="tag-loading-shimmer"></div>`;

  try {
    const res = await fetch(`${API}/tags/my`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`   // ← THIS is the critical fix
      }
    });

    const data = await res.json();

    // Handle expired/invalid token
    if (res.status === 401 || res.status === 403) {
      localStorage.clear();
      window.location.href = 'login.html';
      return;
    }

    const tags = data.tags || data; // handle both {tags:[]} and []

    if (!Array.isArray(tags) || tags.length === 0) {
      // Show empty state — no fake tags
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

    // Render only real purchased tags
    container.innerHTML = tags.map(tag => renderTagCard(tag)).join('');

  } catch (err) {
    console.error('Failed to load tags:', err);
    container.innerHTML = `
      <div class="empty">
        <div class="ei">⚠️</div>
        <h3>Could not load tags</h3>
        <p>Server may be starting up. Please wait 30 seconds and refresh.</p>
        <button class="btn btn-primary" onclick="loadMyTags()">Retry</button>
      </div>`;
  }
}

// ── Render a Single Tag Card ─────────────────────────────────
function renderTagCard(tag) {
  const isActive = tag.isContactable !== false;
  const tagType = tag.type === 'pet' ? '🐾 Pet Tag' : '🚗 Vehicle Tag';
  const badgeClass = isActive ? 'badge-green' : 'badge-red';
  const badgeText = isActive ? '✅ Active' : '🔴 Inactive';

  return `
    <div class="card anim" style="margin-bottom:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;">
        <div>
          <div style="font-weight:800;font-size:1rem;">${tagType}</div>
          <div style="font-size:.85rem;color:#6b7280;margin-top:.2rem;">
            Code: <b>${tag.tagCode || tag._id}</b>
          </div>
          ${tag.plateNumber ? `<div style="font-size:.85rem;color:#6b7280;">Plate: <b>${tag.plateNumber}</b></div>` : ''}
          ${tag.petName ? `<div style="font-size:.85rem;color:#6b7280;">Pet: <b>${tag.petName}</b></div>` : ''}
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <hr style="border:none;border-top:1px solid #f3f4f6;margin:.8rem 0;">
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
        <button class="btn-outline" onclick="toggleTagPrivacy('${tag._id || tag.tagCode}', ${!isActive})">
          ${isActive ? '🔕 Disable Tag' : '🔔 Enable Tag'}
        </button>
      </div>
    </div>`;
}

// ── Toggle Tag Active/Inactive ───────────────────────────────
async function toggleTagPrivacy(tagId, newStatus) {
  try {
    const res = await fetch(`${API}/tags/${tagId}/toggle`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isContactable: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadMyTags(); // Reload to reflect the change
    } else {
      alert('Failed to update tag: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Server error while toggling tag.');
  }
}

// ── Init ─────────────────────────────────────────────────────
loadMyTags();
