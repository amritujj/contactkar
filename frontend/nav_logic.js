
document.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginBtn = document.getElementById('loginBtn');
    const accountBtn = document.getElementById('accountBtn');

    if (isLoggedIn) {
        if(loginBtn) loginBtn.style.display = 'none';
        if(accountBtn) accountBtn.style.display = 'inline-block';
    } else {
        if(loginBtn) loginBtn.style.display = 'inline-block';
        if(accountBtn) accountBtn.style.display = 'none';
    }
});

function logout() {
    localStorage.removeItem('isLoggedIn');
    window.location.href = 'index.html';
}
