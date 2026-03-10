// scroll-animations.js
document.addEventListener("DOMContentLoaded", function() {
    // 1. Setup the Intersection Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            // When the element enters the screen
            if (entry.isIntersecting) {
                entry.target.classList.add("show-element");
                // Stop observing once it has animated so it doesn't repeat infinitely
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.15, // Triggers when 15% of the element is visible
        rootMargin: "0px 0px -50px 0px" // Triggers slightly before it fully hits the bottom of the screen
    });

    // 2. Grab all the elements we want to animate
    const hiddenElements = document.querySelectorAll('.feature-card, .tier-card, h2, .feature-list, img');
    
    // 3. Add the starting "hidden" class and observe them
    hiddenElements.forEach((el) => {
        el.classList.add('hidden-element');
        observer.observe(el);
    });
});
