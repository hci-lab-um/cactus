const { ipcRenderer } = require('electron')
const { createCursor, followCursor } = require('../../tools/cursor')
const { scrollBy, generateUUID } = require('../../tools/utils')
const DOMPurify = require('dompurify');
const config = require('config');
//const { byId, readFile, dwell } = require('./js/utils')
const { QuadtreeBuilder, InteractiveElement, PageDocument, QtBuilderOptions, QtRange } = require('cactus-quadtree-builder')
// const { MenuBuilder, MenuBuilderOptions, MenuRange } = require('cactus-menu-builder')

const isDevelopment = process.env.NODE_ENV === "development";

let cursor;
let browserView;
let qtBuilder;
let qtOptions;
let currentQt;
let timeoutCursorHovering;

// Exposes an HTML sanitizer to allow for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
window.addEventListener('DOMContentLoaded', () => {
	// Expose DOMPurify to the renderer process
	window.sanitizeHTML = (html) => {
		return DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
	};

	//Init cursor
	createCursor('cactus_cursor');
	cursor = document.getElementById('cactus_cursor');
	followCursor('cactus_cursor');
});

// let menuBuilder;
// let menuBuilderOptions;
// let currentNavAreaTree;

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

function clearHighlightedElements() {
	// Remove all previous points with class "point"
	const previousPoints = document.querySelectorAll('.qtpoint');
	previousPoints.forEach(point => point.remove());
}

function generateQuadTree() {
	//Recreate quadtree
	qtOptions = new QtBuilderOptions(window.innerWidth, window.innerHeight, 'new', 1);
	qtBuilder = new QuadtreeBuilder(qtOptions);
	// Query for elements matching the provided selector
	const elements = Array.from(document.querySelectorAll('button, a, textarea, input, select, date, div[role="button"], span[role="button"], div[role="link"], span[role="link"], [role="checkbox"], [role="radio"], [role="option"], [role="tab"], [role="menu"], [role="switch"], [role="slider"], [role="combobox"]'));

	// Filter the visible elements and assign unique ID
	const visibleElements = filterVisibleElements(elements).map(e => {
		e.dataset.cactusId = generateUUID();
		return InteractiveElement.fromHTMLElement(e);
	});

	let pageDocument = new PageDocument(document.title, document.URL, visibleElements, window.innerWidth, window.innerHeight, null);
	qtBuilder.buildAsync(pageDocument).then((qt) => {
		currentQt = qt;

		//Only in debug mode - show which points are available for interaction
		if (isDevelopment) {
			const viewRange = new QtRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
			const elementsInView = qt.queryRange(viewRange);
			clearHighlightedElements();
			elementsInView.forEach(ve => {
				highlightAvailableElements(ve.x, ve.y, ve.width, ve.height);
			});
		}
	});
}

// function generateNavAreasTree() {
// 	//Recreate quadtree
// 	menuBuilderOptions = new MenuBuilderOptions(window.innerWidth, window.innerHeight, 'new');
// 	menuBuilder = new QuadtreeBuilder(qtOptions);

// 	let pageDocument = new PageDocument(document.title, document.URL, visibleElements, window.innerWidth, window.innerHeight, null);
// 	qtBuilder.buildAsync(pageDocument).then((qt) => {
// 		currentQt = qt;

// 		//Only in debug mode - show which points are available for interaction
// 		if (isDevelopment) {
// 			const viewRange = new MenuRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
// 			const elementsInView = qt.queryRange(viewRange);
// 			clearHighlightedElements();
// 			elementsInView.forEach(ve => {
// 				highlightAvailableElements(ve.x, ve.y, ve.width, ve.height);
// 			});
// 		}
// 	});
// }

function highlightAvailableElements(x, y, width, height) {
	// Create a new div element for the point
	const point = document.createElement('div');

	// Get the current viewport's scroll position
	const viewportX = window.scrollX;
	const viewportY = window.scrollY;

	// Set styles for the point
	point.classList.add('qtpoint');
	point.style.width = width + 'px';
	point.style.height = height + 'px';
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

	let rangeWidth = config.get('dwelling.rangeWidth');
	let rangeHeight = config.get('dwelling.rangeHeight');
	//TODO: needs to be centred - this will also enlarge eye icon
	cursor.style.width = rangeWidth + 'px';
	cursor.style.height = rangeHeight + 'px';
	cursor.style.border = '2px solid red';
}

ipcRenderer.on('ipc-main-browserview-loaded', () => {
	//Create tree on visible elements
	generateQuadTree();

	//EXPERIMENTAL - JS EVENTS (E.g. click on tab element, does not fire up (although it's firing up changes in quick succession when banners change etc...) - to test properly)
	//Set mutation observer - and re-generate quadtree on mutations

	//Consdier this: https://kasp9023.medium.com/easily-observe-changes-in-dom-tree-with-mutationobserver-api-1c27cbc3ea7e
	// const observer = new MutationObserver((mutationsList, observer) => {
	//   for(const mutation of mutationsList) {
	//     if (mutation.type === 'subtree') { //childlist was firing up too many events... this might not work as expected.
	//       generateQuadTree();
	//     }
	//   }
	// });
	// const config = { attributes: true, childList: true, subtree: true };
	// observer.observe(document.body, config);

	let mutationObserverCallbackExecuting = false;
	// Create an observer instance linked to the callback function
	const observer = new MutationObserver((mutationsList) => {
		// If callback is already executing, ignore this invocation
		if (mutationObserverCallbackExecuting) return;

		// Iterate through the list of mutations, and only generate quadTrees when: 
		// a) not custom Cursor related (debounce every x ms to avoid too many quadtree gen calls)
		// b) not a known attribute being added/removed
		for (let mutation of mutationsList) {
			if (
				mutation.target.id != 'cactus_cursor'
				&& !mutation.target.classList.contains('cactusElementVisualise')
				&& !mutation.target.classList.contains('cactusElementVisualiseRemoved')
			) {
				//Indicate callback execution
				mutationObserverCallbackExecuting = true;

				//Execute quadtree generation
				generateQuadTree();

				//Reset flag to allow next callback execution on x ms
				setTimeout(() => {
					mutationObserverCallbackExecuting = false;
				}, 1000);
				break;
			}
		}
	});

	const observerOptions = {
		attributes: true, //necessary for collapsable elements etc...
		childList: true,
		subtree: true,
	};
	// Start observing the target node for configured mutations
	observer.observe(document.body, observerOptions);


	//Handle mouse behaviour on browserview
	browserView = document.getRootNode();

	browserView.addEventListener('mouseover', (event) => {
		//Show cursor
		cursor.style.visibility = 'visible'

		if (currentQt) {
			// Clear any existing interval to avoid multiple intervals running simultaneously for mouse cursor hovering activity
			clearInterval(timeoutCursorHovering);

			// Start a new interval to execute the code every one second
			timeoutCursorHovering = setInterval(function () {
				//Find the elements in the quadtree
				var x = event.clientX; // X location relative to the viewport
				var y = event.clientY; // Y location relative to the viewport
				let rangeWidth = config.get('dwelling.rangeWidth');
				let rangeHeight = config.get('dwelling.rangeHeight');
				const queryAllElementsInView = new QtRange(x - (rangeWidth / 2), y - (rangeHeight / 2), rangeWidth, rangeHeight);
				const elementsInQueryRange = currentQt.queryRange(queryAllElementsInView);

				//Remove duplicate elements by ID (larger elements are split into multiple smaller elements, replicating the ID)
				var uniqueInteractiveElementsInQueryRange = [];
				var seenElements = new Set();
				elementsInQueryRange.forEach(function (el) {
					if (!seenElements.has(el.id)) {
						seenElements.add(el.id);
						uniqueInteractiveElementsInQueryRange.push(el);
					}
				});

				ipcRenderer.send('ipc-browserview-elements-in-mouserange', uniqueInteractiveElementsInQueryRange);
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

ipcRenderer.on('ipc-browserview-scrolldown', () => {
	let scrollDistance = config.get('dwelling.scrollDistance');
	scrollBy(0, scrollDistance);
	setTimeout(function () {
		generateQuadTree();
	}, 500);
})

ipcRenderer.on('ipc-browserview-scrollup', () => {
	let scrollDistance = config.get('dwelling.scrollDistance');
	scrollBy(0, scrollDistance * -1);
	setTimeout(function () {
		generateQuadTree();
	}, 500);
})

ipcRenderer.on('ipc-browserview-back', () => {
	window.history.back();
});

ipcRenderer.on('ipc-browserview-forward', () => {
	window.history.forward();
});

// function checkScrollers()
// {
//    //Hide scrollbar when at the very top
//    if (!window.scrollY) {
//     ipcRenderer.send('ipc-browserview-scroll-up-hide')
//   } else {
//     ipcRenderer.send('ipc-browserview-scroll-up-show')
//   }
// }

ipcRenderer.on('ipc-browserview-click-element', async (event, elementToClick) => {
	// Find the element at the specified x,y coordinates
	const element = document.elementFromPoint(elementToClick.insertionPointX, elementToClick.insertionPointY);
	element.click();
});

ipcRenderer.on('ipc-browserview-highlight-elements', async (event, elementsToHighlight) => {
	elementsToHighlight.forEach(el => {
		var elementToMark = document.querySelector('[data-cactus-id="' + el.id + '"]');
		if (!elementToMark.classList.contains('cactusElementVisualise')) {
			elementToMark.classList.add('cactusElementVisualise');
			setTimeout(function () {
				//cactusElementVisualiseRemoved class is necessary to filter out cactus-initiated attribute mutations and stop the QT being regenerated
				elementToMark.classList.add('cactusElementVisualiseRemoved');
				elementToMark.classList.remove('cactusElementVisualise');
			}, 800);
		}
	});
});

ipcRenderer.on('ipc-browserview-create-quadtree', () => {
	//ISSUES: Node-Config is required by Cactus, and the config/default.json file would need to be recreated on cactus itself, rather than just the builder code. Which might not be a bad idea. Think about it.
	generateQuadTree();
})