const { ipcRenderer }           = require('electron')
const { createCursor, followCursor } = require('./js/cursor')
//const { byId, readFile, dwell } = require('./js/utils')
const { QuadtreeBuilder, InteractiveElement, PageDocument, Options, Range } = require('cactus-quadtree-builder')

let cursor; 
let browserView;
let qtBuilder;
let qtOptions;

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
  const elements = Array.from(document.querySelectorAll('button, a, textarea, input, select, date, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="option"], [role="tab"], [role="menu"], [role="switch"], [role="slider"]'));
  // Filter the visible elements
  const visibleElements = filterVisibleElements(elements).map(e => {
    return InteractiveElement.fromHTMLElement(e);
  });

  let pageDocument = new PageDocument(document.title, document.URL, visibleElements, window.innerWidth, window.innerHeight, null);
  qtBuilder.buildAsync(pageDocument).then((qt) => {
    removePreviousPoints();
    //The drawPoint function below should take the search result
    const queryAllElementsInView = new Range(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
    const elementsInQueryRange = qt.queryRange(queryAllElementsInView);
    elementsInQueryRange.forEach(ve => {
      drawPoint(ve.insertionPointX, ve.insertionPointY);
    });
  });
}

function drawPoint(x, y) {
  // Create a new div element for the point
  const point = document.createElement('div');

  // Get the current viewport's scroll position
  const viewportX = window.scrollX;
  const viewportY = window.scrollY;

  // Set styles for the point
  point.classList.add('qtpoint');
  point.style.width = '10px';
  point.style.height = '10px';
  point.style.backgroundColor = 'green';
  point.style.position = 'absolute';
  point.style.borderRadius = '50%';

  // Set the position of the point relative to the viewport
  point.style.left = (x + viewportX) + 'px';
  point.style.top = (y + viewportY) + 'px';

  // Append the point to the viewport container
  document.body.appendChild(point);
}

ipcRenderer.on('browserViewLoaded', () => {
    generateQuadTree();
    
    createCursor('cursor');
    cursor = document.getElementById('cursor');
    followCursor('cursor');

    browserView = document.getRootNode();
  
    browserView.addEventListener('mouseout', () => {
        cursor.style.visibility = 'hidden'
    })

    browserView.addEventListener('mouseover', () => {
        cursor.style.visibility = 'visible'
    })
  });

  ipcRenderer.on('browserViewScrollDown', () => {
    document.documentElement.scrollBy(0, 100);
    setTimeout(function() {
      ipcRenderer.send('scrollingCompleted');
    }, 500);
    
  })

  ipcRenderer.on('browserViewScrollUp', () => {
    document.documentElement.scrollBy(0, -100);
    setTimeout(function() {
      ipcRenderer.send('scrollingCompleted');
    }, 500);
  })

  ipcRenderer.on('create-quadtree', () => {
    //ISSUES: Node-Config is required by Cactus, and the config/default.json file would need to be recreated on cactus itself, rather than just the builder code. Which might not be a bad idea. Think about it.
    generateQuadTree();    
  })