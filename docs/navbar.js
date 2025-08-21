document.addEventListener('DOMContentLoaded', function() {
  // Smooth scroll for nav links
  document.querySelectorAll('.navbar a').forEach(function(link) {
    link.addEventListener('click', function(e) {
      const targetId = link.getAttribute('href').replace('#', '');
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        window.scrollTo({
          top: target.offsetTop - 80, // adjust for navbar height
          behavior: 'smooth'
        });
      }
    });
  });

  // Smooth scroll for hero buttons
  var heroButtons = document.querySelectorAll('.hero-buttons .btn');
  if (heroButtons.length > 0) {
    // Learn About Our Technology -> About section
    heroButtons[0].addEventListener('click', function(e) {
      var aboutSection = document.getElementById('about');
      if (aboutSection) {
        e.preventDefault();
        window.scrollTo({
          top: aboutSection.offsetTop - 80,
          behavior: 'smooth'
        });
      }
    });
    // Meet Our Team -> People section
    if (heroButtons[1]) {
      heroButtons[1].addEventListener('click', function(e) {
        var peopleSection = document.getElementById('people');
        if (peopleSection) {
          e.preventDefault();
          window.scrollTo({
            top: peopleSection.offsetTop - 80,
            behavior: 'smooth'
          });
        }
      });
    }
  }

  // Highlight active nav tab on scroll
  function updateActiveNav() {
    const sections = ['about', 'features', 'publications', 'people', 'contact'];
    const navLinks = document.querySelectorAll('.navbar-list a');
    let currentSection = sections[0];
    let scrollPosition = window.scrollY + 100; // offset for navbar

    for (let i = 0; i < sections.length; i++) {
      const section = document.getElementById(sections[i]);
      if (section && section.offsetTop <= scrollPosition) {
        currentSection = sections[i];
      }
    }

    navLinks.forEach(link => {
      // Only update active class on scroll, not on click
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + currentSection) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', updateActiveNav);
  updateActiveNav();
});
