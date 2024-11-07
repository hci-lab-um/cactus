var mouse = { x: 0, y: 0 }


// Create a Trusted Types policy for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
const policy = window.trustedTypes.createPolicy('default', {
	// This method returns the input as is, without any sanitization
	// but adds a TrustedHTML wrapper around the content
	createHTML: (input) => input
});

// Init cursor
createCursor('cactus_cursor');
cursor = document.getElementById('cactus_cursor');
followCursor('cactus_cursor');

window.cactusAPI.on('ipc-main-tabview-loaded', (useNavAreas) => {
	// Setup the QuadTree and NavAreasTree
	generateQuadTree();
	if (useNavAreas) generateNavAreasTree();

	// Setup mutation observer to detect changes in the DOM
	// EXPERIMENTAL - JS EVENTS (E.g. click on tab element, does not fire up (although it's firing up changes in quick succession when banners change etc...) - to test properly)
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
				if (useNavAreas) generateNavAreasTree();

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

	// Handle mouse behaviour on tabview
	tabView = document.getRootNode();

	tabView.addEventListener('mouseover', (event) => {
		cursor.style.visibility = 'visible'
		// Clear any existing interval to avoid multiple intervals running simultaneously for mouse cursor hovering activity
		// clearInterval(timeoutCursorHovering);
		window.cactusAPI.send('ipc-tabview-cursor-mouseover', { x: event.clientX, y: event.clientY });
	});

	tabView.addEventListener('mouseout', () => {
		// Hide the cursor when the mouse leaves the element
		cursor.style.visibility = 'hidden'
		// Clear the interval when the mouse leaves the element
		window.cactusAPI.send('ipc-tabview-cursor-mouseout');
	})
});

window.cactusAPI.on('ipc-clear-highlighted-elements', () => {
	// Remove all previous points with class "point"
	const previousPoints = document.querySelectorAll('.cactus-element-highlight');
	previousPoints.forEach(point => point.remove());
});

window.cactusAPI.on('ipc-highlight-available-elements', (contents) => {
	const { elementsInView, rangeWidth, rangeHeight, color } = contents;
	elementsInView.forEach(ve => {
		highlightAvailableElements(ve.x, ve.y, ve.width, ve.height, color, rangeWidth, rangeHeight);
	});
});

window.cactusAPI.on('ipc-tabview-scrolldown', (configData) => {
	let { scrollDistance, useNavAreas } = configData;

	scrollBy({
		top: scrollDistance,
		left: 0,
		behavior: "smooth"
	});
	setTimeout(function () {
		generateQuadTree();
		if (useNavAreas) generateNavAreasTree();
	}, 500);
})

window.cactusAPI.on('ipc-tabview-scrollup', (configData) => {
	let { scrollDistance, useNavAreas } = configData;

	scrollBy({
		top: scrollDistance * -1,
		left: 0,
		behavior: "smooth"
	});
	setTimeout(function () {
		generateQuadTree();
		if (useNavAreas) generateNavAreasTree();
	}, 500);
})

window.cactusAPI.on('ipc-tabview-back', () => {
	window.history.back();
});

window.cactusAPI.on('ipc-tabview-forward', () => {
	window.history.forward();
});


// function checkScrollers()
// {
//    //Hide scrollbar when at the very top
//    if (!window.scrollY) {
//     ipcRenderer.send('ipc-tabview-scroll-up-hide')
//   } else {
//     ipcRenderer.send('ipc-tabview-scroll-up-show')
//   }
// }


// This IPC event is triggered when the user submits the value inside the overlay keyboard.
// It attempts to find the element to update and sets the value to the submitted value.
window.cactusAPI.on('ipc-tabview-keyboard-input', (value, elementToUpdate) => {
	let element = document.querySelector('[data-cactus-id="' + elementToUpdate.id + '"]');

	// Since the ID of the element may change at times, the element may instead be found using the x,y coordinates
	if (!element) {
		element = document.elementFromPoint(elementToUpdate.insertionPointX, elementToUpdate.insertionPointY);
	}

	if (element) {
		element.focus();
		element.value = value;
	} else {
		console.error("Element not found for update:", elementToUpdate);
	}
});

window.cactusAPI.on('ipc-trigger-click-under-cursor', () => {
	const element = document.elementFromPoint(mouse.x, mouse.y);
	if (element) {
		element.click();
	} else {
		console.error("Element to click under cursor has not been found");
	}
});

window.cactusAPI.onAsync('ipc-tabview-click-element', (elementToClick) => {
	// // Find the element at the specified x,y coordinates
	// let element;
	// try{
	// 	element = document.elementFromPoint(elementToClick.insertionPointX, elementToClick.insertionPointY);
	// }catch(e){
	// 	console.error("Element not found for click using insertion point:", elementToClick);
	// }
	// if (element) {
	// 	element.focus();
	// 	element.click();
	// }
	// else {
	// 	//In case element has been hidden or has changed location, try finding it using the unique cactus-id
	// 	element = document.querySelector('[data-cactus-id="' + elementToClick.id + '"]');
	// 	if (element) {
	// 		//If it's a link - go to its href rather than relying on focusing/clicking (works nicely when anchor is hidden in some collapsable component)
	// 		if (element.nodeName == 'A' && (element.getAttribute('href') && element.getAttribute('href') != '#'))
	// 			window.cactusAPI.send('browse-to-url', element.getAttribute('href'));
	// 	}
	// }

	element = document.querySelector('[data-cactus-id="' + elementToClick.id + '"]');

	if (!element){
		console.log("Element to click not found by cactus id");
		element = document.elementFromPoint(elementToClick.insertionPointX, elementToClick.insertionPointY);
	}

	if (element) {
		//If it's a link - go to its href rather than relying on focusing/clicking (works nicely when anchor is hidden in some collapsable component)
		if (element.nodeName == 'A' && (element.getAttribute('href') && element.getAttribute('href') != '#'))
			window.cactusAPI.send('browse-to-url', element.getAttribute('href'));
		else {
			element.focus();
			element.click();
		}
	} else {
		console.error("Element to click not found by cactus id");
	}
});

window.cactusAPI.onAsync('ipc-tabview-highlight-elements', (elementsToHighlight) => {
	elementsToHighlight.forEach(el => {
		// Each element is of type InteractiveElement whose id is set to the cactusId, hence we use el.id not el.dataset.cactusId
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

window.cactusAPI.on('ipc-tabview-create-quadtree', (useNavAreas) => {
	// //ISSUES: Node-Config is required by Cactus, and the config/default.json file would need to be recreated on cactus itself, rather than just the builder code. Which might not be a bad idea. Think about it.
	// let useNavAreas = config.get('dwelling.activateNavAreas');
	console.log("Creating QuadTree and NavAreasTree");
	generateQuadTree();
	if (useNavAreas) generateNavAreasTree();
});

function setMouseXY(e) {
	mouse.x = (window.Event) ? e.pageX : window.Event.clientX + (document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft);
	mouse.y = (window.Event) ? e.pageY : window.Event.clientY + (document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop);
}

function createCursor(id) {
	var cursor = document.createElement('div')
	var cursorHTML = `<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="eye" class="fa-eye fa-w-18" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M288 144a110.94 110.94 0 0 0-31.24 5 55.4 55.4 0 0 1 7.24 27 56 56 0 0 1-56 56 55.4 55.4 0 0 1-27-7.24A111.71 111.71 0 1 0 288 144zm284.52 97.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400c-98.65 0-189.09-55-237.93-144C98.91 167 189.34 112 288 112s189.09 55 237.93 144C477.1 345 386.66 400 288 400z"></path></svg>`;
	console.log(cursorHTML); // raw cursor HTML

	// The following step is needed due to the 'This document requires 'TrustedHTML' assignment' warning
	var trustedHTML = policy.createHTML(cursorHTML);

	console.log(trustedHTML); // trusted cursor HTML
	cursor.innerHTML = trustedHTML;
	cursor.setAttribute('id', id)
	cursor.style.width = '50px'
	cursor.style.height = '50px'
	cursor.style.color = "#a091eb"
	cursor.style.opacity = '0.4'
	cursor.style.zIndex = '9999999999'
	cursor.style.position = 'absolute'
	cursor.style.margin = '-20px 0 0 -20px'
	cursor.style['pointer-events'] = 'none'

	// if (!id.localeCompare('hiddenCursor')) {
	//   cursor.style.opacity = 0
	// }

	document.body.appendChild(cursor);
}

function followCursor(id) {
	var cursor = document.getElementById(id)
	document.addEventListener('mousemove', setMouseXY, true)

	var cursorPos = { x: 0, y: 0 }

	// Increase interval to make it slower
	setInterval(followMouse, 20)

	function followMouse() {
		var distX = mouse.x - cursorPos.x
		var distY = mouse.y - cursorPos.y

		cursorPos.x += distX / 10
		cursorPos.y += distY / 10

		cursor.style.left = cursorPos.x + 'px'
		cursor.style.top = cursorPos.y + 'px'
	}
}

function generateUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

// Gets the contents needed from the renderer process and sends them to the main process for generating the QuadTree
function generateQuadTree() {
	const clickableSelectors = [
		'button', 'a', 'textarea', 'input', 'select', 'date',
		'div[role="button"]', 'span[role="button"]', 'div[role="link"]', 'span[role="link"]',
		'[role="checkbox"]', '[role="radio"]', '[role="option"]', '[role="tab"]',
		'[role="menu"]', '[role="switch"]', '[role="slider"]', '[role="combobox"]'
	];
	const clickableElements = Array.from(document.querySelectorAll(clickableSelectors.join(', ')));
	const visibleElements = filterVisibleElements(clickableElements).map(e => {
		if (!e.dataset.cactusId) {
			console.log("Cactus Id of element", e, ", is empty");
			e.dataset.cactusId = generateUUID();
		}
		return e;
	});
	// console.log("Visible elements", visibleElements);
	const serializedElements = visibleElements.map(serializeElement); //creating an element object for each element in the array

	const quadTreeContents = {
		serializedVisibleElements: serializedElements,
		docTitle: document.title,
		docURL: document.URL
	};
	window.cactusAPI.send('ipc-tabview-generateQuadTree', quadTreeContents);
}

// Gets the contents needed from the renderer process and sends them to the main process to generate the NavAreasTree
function generateNavAreasTree() {
	const menuSelectors = [
		'[role="navigation"]', 'nav', '[role="menubar"]', '[class="nav-wrapper"]'
	];
	const interactiveMenus = Array.from(document.querySelectorAll(menuSelectors.join(', ')));
	const visibleMenus = filterVisibleElements(interactiveMenus).map(e => {
		e.dataset.cactusId = generateUUID();
		return e;
	});
	const serializedMenus = visibleMenus.map(serializeMenuElement);

	const navAreasTreeContents = {
		serializedVisibleMenus: serializedMenus,
		docTitle: document.title,
		docURL: document.URL
	};
	window.cactusAPI.send('ipc-tabview-generateNavAreasTree', navAreasTreeContents);
}

// This serializes relevant properties of the elements
function serializeElement(element) {
	return {
		id: element.id,
		cactusId: element.dataset.cactusId,
		className: element.className,
		tagName: element.tagName,
		rectX: element.getBoundingClientRect().x,
		rectY: element.getBoundingClientRect().y,
		rectWidth: element.getBoundingClientRect().width,
		rectHeight: element.getBoundingClientRect().height,
		textContent: element.textContent,
		innerText: element.innerText,
		value: element.value,
		title: element.title,
		type: element.type,
		checked: element.checked,
		state: element.state,
		selectedIndex: element.selectedIndex,
		role: element.getAttribute('role'),
		ariaLabel: element.getAttribute('aria-label'),
		ariaLabelledByElement: (() => {
			const labelledByElement = document.getElementById(element.getAttribute('aria-labelledby'));
			return labelledByElement ? {
				textContent: labelledByElement.textContent
			} : null;
		})(),
		associatedLabel: (() => {
			const label = document.querySelector(`label[for="${element.id}"]`);
			return label ? {
				textContent: label.textContent
			} : null;
		})(),
		options: element.options ? Array.from(element.options).map(option => {
			return {
				textContent: option.textContent
			};
		}) : null,
		nodeType: element.nodeType,
		childNodes: element.childNodes ? Array.from(element.childNodes).map(serializeChildNode) : null
	};
}

function serializeChildNode(node) {
	return {
		nodeType: node.nodeType,
		nodeValue: node.nodeValue,
		tagName: node.tagName,
		alt: node.alt,
		childNodes: node.childNodes ? Array.from(node.childNodes).map(serializeChildNode) : null
	};
}

function serializeMenuElement(element) {
	return {
		id: element.id,
		cactusId: element.dataset.cactusId,
		tagName: element.tagName,
		rectX: element.getBoundingClientRect().x,
		rectY: element.getBoundingClientRect().y,
		rectWidth: element.getBoundingClientRect().width,
		rectHeight: element.getBoundingClientRect().height,
		textContent: element.textContent,
		innerText: element.innerText,
		href: element.getAttribute('href'),
		isHeading: element.querySelector('h1,h2,h3,h4,h5,h6') ? true : false,
		children: element.children ? Array.from(element.children).map(serializeMenuElement) : null
	};
}

// This filters out elements that are not visible (in viewport) or have no dimensions
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

function highlightAvailableElements(x, y, width, height, color, dwellingRangeWidth, dwellingRangeHeight) {
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

	//Highlight cursor dwelling range
	//TODO: needs to be centred - this will also enlarge eye icon
	cursor.style.width = dwellingRangeWidth + 'px';
	cursor.style.height = dwellingRangeHeight + 'px';
	cursor.style.border = '2px solid red';
}