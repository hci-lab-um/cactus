const { ipcRenderer } = require('electron')
const { createCursor, followCursor } = require('../../tools/cursor')
const { scrollBy, generateUUID } = require('../../tools/utils')
const DOMPurify = require('dompurify');
const config = require('config');
//const { byId, readFile, dwell } = require('./js/utils')
const { QuadtreeBuilder, InteractiveElement, QtPageDocument, QtBuilderOptions, QtRange } = require('cactus-quadtree-builder')
const { MenuBuilder, NavArea, MenuPageDocument, MenuBuilderOptions, MenuRange } = require('cactus-menu-builder')

const isDevelopment = process.env.NODE_ENV === "development";

let cursor;
let browserView;
let qtBuilder;
let qtOptions;
let currentQt;
let timeoutCursorHovering;
let menuBuilder;
let menuBuilderOptions;
let currentNavAreaTree;

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
			//Check if element is, at least partly, within the viewport
			(
				rect.x <= (window.innerWidth || document.documentElement.clientWidth) &&
				rect.x + rect.width >= 0 &&
				rect.y <= (window.innerHeight || document.documentElement.clientHeight) &&
				rect.y + rect.height >= 0

			)
		);
	});
}

function clearHighlightedElements() {
	// Remove all previous points with class "point"
	const previousPoints = document.querySelectorAll('.cactus-element-highlight');
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

	let pageDocument = new QtPageDocument(document.title, document.URL, visibleElements, window.innerWidth, window.innerHeight, null);
	qtBuilder.buildAsync(pageDocument).then((qt) => {
		currentQt = qt;

		//Only in debug mode - show which points are available for interaction
		if (isDevelopment) {
			const viewRange = new QtRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
			const elementsInView = qt.queryRange(viewRange);
			clearHighlightedElements();
			elementsInView.forEach(ve => {
				highlightAvailableElements(ve.x, ve.y, ve.width, ve.height, '#702963');
			});
		}
	});
}

function generateNavAreasTree() {
	//Recreate quadtree
	menuBuilderOptions = new MenuBuilderOptions(window.innerWidth, window.innerHeight, 'new');
	menuBuilder = new MenuBuilder(menuBuilderOptions);

	const interactiveMenus = Array.from(document.querySelectorAll('[role="navigation"], nav, [role="menubar"], [class="nav-wrapper"]'));

	// Filter the visible elements and assign unique ID
	const visibleElements = filterVisibleElements(interactiveMenus).map(e => {
		e.dataset.cactusId = generateUUID();
		return NavArea.fromHTMLElement(e);
	});
	let pageDocument = new MenuPageDocument(document.title, document.URL, visibleElements, window.innerWidth, window.innerHeight, null);

	menuBuilder.buildAsync(pageDocument).then((hierarchicalAreas) => {
		currentNavAreaTree = hierarchicalAreas;

		//Only in debug mode - show which points are available for interaction
		if (isDevelopment) {
			const viewRange = new MenuRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
			const elementsInView = currentNavAreaTree.queryRange(viewRange, true);
			elementsInView.forEach(ve => {
				highlightAvailableElements(ve.x, ve.y, ve.width, ve.height, '#E34234');
			});
		}
	});
}

function highlightAvailableElements(x, y, width, height, color) {
	// Create a new div element for the point
	const point = document.createElement('div');

	// Get the current viewport's scroll position
	const viewportX = window.scrollX;
	const viewportY = window.scrollY;

	// Set styles for the point
	point.classList.add('cactus-element-highlight');
	point.style.width = width + 'px';
	point.style.height = height + 'px';
	point.style.backgroundColor = 'transparent';
	//point.style.border = '2px solid ' + color;
	point.style.outline = '2px dashed ' + color;
	point.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
	point.style.position = 'absolute';
	point.style.zIndex = 99999999;
	// Set the position of the point relative to the viewport
	point.style.left = (x + viewportX) + 'px';
	point.style.top = (y + viewportY) + 'px';

	// Append the point to the viewport container
	document.body.appendChild(point);

	//Highlight cursor
	let rangeWidth = config.get('dwelling.rangeWidth');
	let rangeHeight = config.get('dwelling.rangeHeight');
	//TODO: needs to be centred - this will also enlarge eye icon
	cursor.style.width = rangeWidth + 'px';
	cursor.style.height = rangeHeight + 'px';
	cursor.style.border = '2px solid red';
}

ipcRenderer.on('ipc-main-browserview-loaded', () => {
	//Create trees on visible elements
	generateQuadTree();
	generateNavAreasTree();

	//EXPERIMENTAL - JS EVENTS (E.g. click on tab element, does not fire up (although it's firing up changes in quick succession when banners change etc...) - to test properly)
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
				&& !mutation.target.classList.contains('cactus-element-highlight')
			) {
				//Indicate callback execution
				mutationObserverCallbackExecuting = true;

				//Execute quadtree generation
				generateQuadTree();
				generateNavAreasTree();

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

		if (currentQt || currentNavAreaTree) {
			// Clear any existing interval to avoid multiple intervals running simultaneously for mouse cursor hovering activity
			clearInterval(timeoutCursorHovering);

			// Start a new interval to execute the code every one second
			timeoutCursorHovering = setInterval(function () {
				//Find the elements in the quadtree
				var x = event.clientX; // X location relative to the viewport
				var y = event.clientY; // Y location relative to the viewport
				let rangeWidth = config.get('dwelling.rangeWidth');
				let rangeHeight = config.get('dwelling.rangeHeight');

				const qtRangeToQuery = new QtRange(x - (rangeWidth / 2), y - (rangeHeight / 2), rangeWidth, rangeHeight);
				const menuRangeToQuery = new MenuRange(x - (rangeWidth / 2), y - (rangeHeight / 2), rangeWidth, rangeHeight);

				const navAreasInQueryRange = currentNavAreaTree.queryRange(menuRangeToQuery, true);
				const elementsInQueryRange = currentQt.queryRange(qtRangeToQuery);

				//Prioritise nav areas if in range
				if (navAreasInQueryRange.length > 0) {
					ipcRenderer.send('ipc-browserview-navareas-in-mouserange', navAreasInQueryRange);
					//Stop continuously querying for elements when hitting a nav area (allow user to interact with menu)
					clearInterval(timeoutCursorHovering);
				}
				else {
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
				}
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
		generateNavAreasTree();
	}, 500);
})

ipcRenderer.on('ipc-browserview-scrollup', () => {
	let scrollDistance = config.get('dwelling.scrollDistance');
	scrollBy(0, scrollDistance * -1);
	setTimeout(function () {
		generateQuadTree();
		generateNavAreasTree();
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
	//Try finding the element using unique cactus-id
	let element = document.querySelector('[data-cactus-id="' + elementToClick.id + '"]');
	if (!element)
		// Find the element at the specified x,y coordinates
		element = document.elementFromPoint(elementToClick.insertionPointX, elementToClick.insertionPointY);

	if (element) {
		//If it's a link - go to its href rather than rely on focusing/clicking (works nicely when anchor is hidden in some collapsable component)
		if (element.nodeName == 'A' && (element.getAttribute('href') && element.getAttribute('href') != '#'))
			ipcRenderer.send('browse-to-url', element.getAttribute('href'));
		else {
			element.focus();
			element.click();
		}
	}
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
	generateNavAreasTree();
})