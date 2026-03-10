// scroll-animations.js
document.addEventListener("DOMContentLoaded", function() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show-element");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1, 
        rootMargin: "0px 0px -40px 0px" 
    });

    // Added .panel and .auth-container to the elements that animate in
    const hiddenElements = document.querySelectorAll('.feature-card, .tier-card, h2, .feature-list, img, .panel, .auth-container');

    hiddenElements.forEach((el) => {
        el.classList.add('hidden-element');
        observer.observe(el);
    });
});
