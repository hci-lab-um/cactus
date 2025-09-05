
// Section IDs for navigation
const SECTION_IDS = ['about', 'features', 'publications', 'people', 'contact'];

// Smooth scroll to a section by ID
function smoothScrollToSection(sectionId, offset = 70) {
  const target = document.getElementById(sectionId);
  if (target) {
    window.scrollTo({
      top: target.offsetTop - offset,
      behavior: 'smooth'
    });
  }
}

// Set up smooth scroll for navbar links
function setupNavbarLinks() {
  document.querySelectorAll('.navbar a').forEach(function (link) {
    link.addEventListener('click', function (e) {
      const targetId = link.getAttribute('href').replace('#', '');
      if (document.getElementById(targetId)) {
        e.preventDefault();
        smoothScrollToSection(targetId, 70);
      }
    });
  });
}

// Set up smooth scroll for hero arrows
function setupHeroArrows() {
  var arrows = document.querySelector('.arrows');
  if (arrows) {
    arrows.style.cursor = 'pointer';
    arrows.addEventListener('click', function (e) {
      e.preventDefault();
      smoothScrollToSection('about', 80);
    });
  }
}

// Highlight active nav tab on scroll
function updateActiveNav() {
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
  let currentSection = null;
  let scrollPosition = window.scrollY + 100; // offset for navbar

  // If above the first section, don't activate any nav link
  const firstSection = document.getElementById(SECTION_IDS[0]);
  if (firstSection && scrollPosition < firstSection.offsetTop) {
    navLinks.forEach(link => link.classList.remove('active'));
    return;
  }

  for (let i = 0; i < SECTION_IDS.length; i++) {
    const section = document.getElementById(SECTION_IDS[i]);
    if (section && section.offsetTop <= scrollPosition) {
      currentSection = SECTION_IDS[i];
    }
  }

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (currentSection && link.getAttribute('href') === '#' + currentSection) {
      link.classList.add('active');
    }
  });
}

// Initialise navigation behaviour
function initNavigation() {
  setupNavbarLinks();
  setupHeroArrows();
  window.addEventListener('scroll', updateActiveNav);
  updateActiveNav();
}


// add function to copy citation text to clipboard
function copyCitation() {
    const citationText = `D. Vella and C. Porter, "Remapping the Document Object Model using Geometric and Hierarchical Data Structures for Efficient Eye Control," Acm Pacmhci, vol. 8, (ETRA), pp. 1–16, 2024. Available: https://dl.acm.org/doi/10.1145/3655608. DOI: 10.1145/3655608.`;

    navigator.clipboard.writeText(citationText).then(() => {
        alert("Citation copied to clipboard!");
    }).catch(err => {
        console.error("Error copying citation: ", err);
    });
}

document.addEventListener('DOMContentLoaded', initNavigation);
