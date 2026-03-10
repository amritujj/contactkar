document.addEventListener('DOMContentLoaded', () => {
    // --- YOUR ORIGINAL LOGIC (DO NOT CHANGE) ---
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginBtn = document.getElementById('loginBtn');
    const accountBtn = document.getElementById('accountBtn');
    if (loginBtn) loginBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
    if (accountBtn) accountBtn.style.display = isLoggedIn ? 'inline-block' : 'none';

    // --- NEW MOBILE MENU LOGIC ---
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');

    if (mobileBtn && navMenu) {
        mobileBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            if (navMenu.classList.contains('active')) {
                mobileBtn.innerHTML = '✕'; // Change to close icon
            } else {
                mobileBtn.innerHTML = '☰'; // Change to hamburger icon
            }
        });
    }
});

// --- YOUR ORIGINAL LOGOUT LOGIC (DO NOT CHANGE) ---
function logout() {
    localStorage.clear(); // clears token, userEmail, userName, isLoggedIn etc.
    window.location.href = 'index.html';
}
