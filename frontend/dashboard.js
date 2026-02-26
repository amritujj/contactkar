const API_BASE = 'https://contactkar.onrender.com/api';

function calculateTotal() {
  const v = parseInt(document.getElementById('vehicleQty').value) || 0;
  const p = parseInt(document.getElementById('petQty').value) || 0;
  const total = v + p;
  const free  = total >= 5 ? 2 : (total >= 3 ? 1 : 0);
  const cost  = Math.max(0, total - free) * 149;
  document.getElementById('totalTagsDisplay').innerText = total;
  document.getElementById('costDisplay').innerText = '₹' + cost;
  document.getElementById('savingsDisplay').innerText = free > 0 ? '(Save ₹' + (free * 149) + '!)' : '';
}

async function placeOrder() {
  const token   = localStorage.getItem('token');
  const v       = parseInt(document.getElementById('vehicleQty').value) || 0;
  const p       = parseInt(document.getElementById('petQty').value) || 0;
  const address = document.getElementById('address').value.trim();
  const city    = document.getElementById('city').value.trim();
  const state   = document.getElementById('state').value.trim();
  const pincode = document.getElementById('pincode').value.trim();

  if (v + p === 0)                         { alert('Please add at least 1 tag.');              return; }
  if (!address || !city || !state || !pincode) { alert('Please fill in your full shipping address.'); return; }

  try {
    const res  = await fetch(API_BASE + '/orders/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ vehicleQty: v, petQty: p, address, city, state, pincode })
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ Order placed! Your tags will be delivered to your door.');
      window.location.href = 'dashboard.html';
    } else {
      alert('Error: ' + (data.error || 'Something went wrong.'));
    }
  } catch (e) {
    alert('Server error. Make sure your Render backend is running!');
  }
}

function confirmDelete() {
  if (confirm('⚠️ This will permanently delete your account and ALL your tags. This cannot be undone.\n\nAre you absolutely sure?')) {
    alert('Account deletion coming soon. Contact support for now.');
  }
}
