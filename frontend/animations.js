// ============================================
//  ContactKar - Global Animation Script
//  Include in every HTML page:
//  <script src="animations.js"></script>
// ============================================

document.addEventListener('DOMContentLoaded', function () {

  // 1. SCROLL REVEAL
  // Any element with class "scroll-anim" will fade in when it enters the viewport
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // only animate once
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.scroll-anim').forEach(function (el) {
    observer.observe(el);
  });

  // 2. AUTO STAGGER CARDS in grids
  // Any .tier-card, .panel, .feature-card will automatically stagger their entry
  const staggerGroups = ['.pricing-grid', '.features-grid', '.steps-grid', '.tags-list-grid'];
  staggerGroups.forEach(function (selector) {
    const parent = document.querySelector(selector);
    if (!parent) return;
    parent.querySelectorAll('.tier-card, .panel, .feature-card, .step-card').forEach(function (card, i) {
      card.style.animationDelay = (i * 0.12) + 's';
    });
  });

  // 3. NAV LOGIN/ACCOUNT BUTTON DETECTION
  // Show "My Account" if logged in, else show "Login"
  const loginBtn   = document.getElementById('loginBtn');
  const accountBtn = document.getElementById('accountBtn');
  if (loginBtn && accountBtn) {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    loginBtn.style.display   = isLoggedIn ? 'none'  : 'inline-block';
    accountBtn.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  // 4. BUTTON CLICK RIPPLE EFFECT
  document.querySelectorAll('.btn, .btn-primary, .btn-buy, button').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      const ripple = document.createElement('span');
      const rect   = btn.getBoundingClientRect();
      const size   = Math.max(rect.width, rect.height);
      ripple.style.cssText =
        'position:absolute;border-radius:50%;background:rgba(255,255,255,0.4);' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'top:' + (e.clientY - rect.top  - size / 2) + 'px;' +
        'left:' + (e.clientX - rect.left - size / 2) + 'px;' +
        'animation:rippleAnim 0.5s ease-out forwards;pointer-events:none;';
      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
      }
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 600);
    });
  });

  // Inject ripple keyframe dynamically
  if (!document.getElementById('ripple-style')) {
    const style = document.createElement('style');
    style.id = 'ripple-style';
    style.textContent =
      '@keyframes rippleAnim {' +
      'from { opacity: 1; transform: scale(0); }' +
      'to   { opacity: 0; transform: scale(2); }' +
      '}';
    document.head.appendChild(style);
  }

  // 5. ACTIVE TAB HIGHLIGHT on Dashboard sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar a');
  sidebarLinks.forEach(function (link, i) {
    link.style.animationDelay = (i * 0.08) + 's';
  });

  // 6. PAGE LOAD PROGRESS BAR
  const bar = document.createElement('div');
  bar.id = 'page-progress-bar';
  bar.style.cssText =
    'position:fixed;top:0;left:0;height:3px;width:0%;' +
    'background:linear-gradient(90deg,#2563eb,#7c3aed);' +
    'z-index:9999;transition:width 0.3s ease;border-radius:0 2px 2px 0;';
  document.body.prepend(bar);
  // Fill to 100% on load
  setTimeout(function () { bar.style.width = '100%'; }, 50);
  setTimeout(function () { bar.style.opacity = '0'; }, 800);
  setTimeout(function () { bar.remove(); }, 1100);

});
