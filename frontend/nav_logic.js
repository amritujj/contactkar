document.addEventListener('DOMContentLoaded', () => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const loginBtn   = document.getElementById('loginBtn');
  const accountBtn = document.getElementById('accountBtn');
  if (loginBtn)   loginBtn.style.display   = isLoggedIn ? 'none' : 'inline-block';
  if (accountBtn) accountBtn.style.display = isLoggedIn ? 'inline-block' : 'none';
});

function logout() {
  localStorage.clear(); // clears token, userEmail, userName, isLoggedIn etc.
  window.location.href = 'index.html';
}
