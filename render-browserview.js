const { ipcRenderer, webContents }           = require('electron')
const { createCursor, followCursor } = require('./js/cursor')
const { scrollBy } = require('./js/utils')
//const { byId, readFile, dwell } = require('./js/utils')
const { QuadtreeBuilder, InteractiveElement, PageDocument, Options, Range } = require('cactus-quadtree-builder')

let cursor; 
let browserView;
let qtBuilder;
let qtOptions;
let currentQt;
let timeoutCursorHovering;

//This function filters out elements that are not visible (in viewport) or have no dimensions
function filterVisibleElements(elements) {
  return elements.filter(element => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
          style &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.offsetWidth > 0 &&
          element.offsetHeight > 0 &&
          rect.x >= 0 &&
          rect.y >= 0 &&
          (rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth))
      );
  });
}

function removePreviousPoints()
{
  // Remove all previous points with class "point"
  const previousPoints = document.querySelectorAll('.qtpoint');
  previousPoints.forEach(point => point.remove());
}

function generateQuadTree(){
  //Recreate quadtree
  qtOptions = new Options(window.innerWidth, window.innerHeight, 'new', 1);
  qtBuilder = new QuadtreeBuilder(qtOptions);
  // Query for elements matching the provided selector
  const elements = Array.from(document.querySelectorAll('button, a, textarea, input, select, date, div[role="button"], span[role="button"], div[role="link"], span[role="link"], [role="checkbox"], [role="radio"], [role="option"], [role="tab"], [role="menu"], [role="switch"], [role="slider"]'));
  // Filter the visible elements
  const visibleElements = filterVisibleElements(elements).map(e => {
    return InteractiveElement.fromHTMLElement(e);
  });

  let pageDocument = new PageDocument(document.title, document.URL, visibleElements, window.innerWidth, window.innerHeight, null);
  qtBuilder.buildAsync(pageDocument).then((qt) => {
    currentQt = qt;

    //Only in debug mode - show which points are available
    removePreviousPoints();
    //Highlight all elements in view (use the Range approach)
    // const queryAllElementsInView = new Range(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
    // const elementsInQueryRange = qt.queryRange(queryAllElementsInView);
    // elementsInQueryRange.forEach(ve => {
    //   highlightArea(ve.x, ve.y, ve.width, ve.height);
    // });
  });
}

function highlightArea(x, y, width, height) {
  // Create a new div element for the point
  const point = document.createElement('div');

  // Get the current viewport's scroll position
  const viewportX = window.scrollX;
  const viewportY = window.scrollY;

  // Set styles for the point
  point.classList.add('qtpoint');
  point.style.width = width+'px';
  point.style.height = height+'px';
  point.style.backgroundColor = 'transparent';
  point.style.border = '2px solid blue';
  point.style.outline = '2px dashed red';
  // point.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
  point.style.position = 'absolute';

  // Set the position of the point relative to the viewport
  point.style.left = (x + viewportX) + 'px';
  point.style.top = (y + viewportY) + 'px';

  // Append the point to the viewport container
  document.body.appendChild(point);
}

ipcRenderer.on('browserViewLoaded', () => {
  //Create tree on visible elements
  generateQuadTree();
  
  //Create cursor
  createCursor('cursor');
  cursor = document.getElementById('cursor');
  followCursor('cursor');


  //EXPERIMENTAL - JS EVENTS (E.g. click on tab element, does not fire up (although it's firing up changes in quick succession when banners change etc...) - to test properly)
  //Set mutation observer - and re-generate quadtree on mutations
  const observer = new MutationObserver((mutationsList, observer) => {
    for(const mutation of mutationsList) {
      if (mutation.type === 'subtree') { //childlist was firing up too many events... this might not work as expected.
        generateQuadTree();
      }
    }
  });
  
  const config = { attributes: true, childList: true, subtree: true };
  observer.observe(document.body, config);

  //Handle mouse behaviour on browserview
  browserView = document.getRootNode();
  
  browserView.addEventListener('mouseover', (event) => {
    //Show cursor
    cursor.style.visibility = 'visible'

    if (currentQt) {
      // Clear any existing interval to avoid multiple intervals running simultaneously for mouse cursor hovering activity
      clearInterval(timeoutCursorHovering);

      // Start a new interval to execute the code every one second
      timeoutCursorHovering = setInterval(function() {
        //Find the elements in the quadtree
        var x = event.clientX; // X location relative to the viewport
        var y = event.clientY; // Y location relative to the viewport
        const queryAllElementsInView = new Range(x-50, y-25, 100, 50);
        const elementsInQueryRange = currentQt.queryRange(queryAllElementsInView);

        //Remove duplicate elements by ID (larger elements are split into multiple smaller elements, replicating the ID)
        var uniqueInteractiveElementsInQueryRange = [];
        var seenElements = new Set();
        elementsInQueryRange.forEach(function(el) {
            if (!seenElements.has(el.id)) {
                seenElements.add(el.id);
                uniqueInteractiveElementsInQueryRange.push(el);
            }
        });
        
        ipcRenderer.send('foundElementsInMouseRange', uniqueInteractiveElementsInQueryRange);
      }, 500);
    }
  })

  browserView.addEventListener('mouseout', () => {
      //Hide cursor
      cursor.style.visibility = 'hidden'
        // Clear the interval when the mouse leaves the element
      clearInterval(timeoutCursorHovering);
  })
});

ipcRenderer.on('browserViewScrollDown', () => {
  scrollBy(0, 100);
  setTimeout(function() {
    generateQuadTree();  
  }, 500);
})

ipcRenderer.on('browserViewScrollUp', () => {
  scrollBy(0, -100);
  setTimeout(function() {
    generateQuadTree();  
  }, 500);
})

ipcRenderer.on('browserViewGoBack', () => {
  window.history.back();
});

ipcRenderer.on('browserViewGoForward', () => {
  window.history.forward();
});

function checkScrollers()
{
   //Hide scrollbar when at the very top
   if (!window.scrollY) {
    ipcRenderer.send('hideScrollUp')
  } else {
    ipcRenderer.send('showScrollUp')
  }
}

ipcRenderer.on('clickElement', async (event, elementToClick, offsetX, offsetY) => {
    // Find the element at the specified x,y coordinates
    const element = document.elementFromPoint(elementToClick.insertionPointX, elementToClick.insertionPointY);
    element.click();
});

ipcRenderer.on('create-quadtree', () => {
  //ISSUES: Node-Config is required by Cactus, and the config/default.json file would need to be recreated on cactus itself, rather than just the builder code. Which might not be a bad idea. Think about it.
  generateQuadTree();    
})