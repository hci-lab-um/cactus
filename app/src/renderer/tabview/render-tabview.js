var mousePos = { x: 0, y: 0 }
var cursorPos = { x: 0, y: 0 }
let cursor;
let cursorInterval;
let scrollDistance;
let isScrolling = false;
let iterator = 0;

// Create a Trusted Types policy for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
const policy = window.trustedTypes.createPolicy('default', {
	// This method returns the input as is, without any sanitization
	// but adds a TrustedHTML wrapper around the content
	createHTML: (input) => input
});

// Init cursor
createCursor('cactus_cursor');
cursor = document.getElementById('cactus_cursor');
followMouse('cactus_cursor');

window.cactusAPI.on('ipc-main-tabview-loaded', (useNavAreas, scrollDist) => {
	scrollDistance = scrollDist;
	initScrollableElements(useNavAreas);

	// Setup the QuadTree and NavAreasTree
	generateQuadTree();
	if (useNavAreas) generateNavAreasTree();

	// Setup mutation observer to detect changes in the DOM
	// EXPERIMENTAL - JS EVENTS (E.g. click on tab element, does not fire up (although it's firing up changes in quick succession when banners change etc...) - to test properly)
	let mutationObserverCallbackExecuting = false;
	// Create an observer instance linked to the callback function
	const mutationObserver = new MutationObserver((mutationsList) => {
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

				// this prevents the insertion of the scrolling buttons from being registered as a mutation
				&& !mutation.target.classList.contains('cactus-scrollButton')
				&& !mutation.target.classList.contains('cactus-scrollUp_outerDiv')
				&& !mutation.target.classList.contains('cactus-scrollDown_outerDiv')
			) {
				console.log("Mutation observed .. calling generate quad tree", mutation);
				//Indicate callback execution
				mutationObserverCallbackExecuting = true;

				//Execute quadtree generation AFTER 1 SECOND TO WAIT FOR THE PAGE TO LOAD THE CHANGES AND DETECT THE NEW ELEMENTS!!!
				setTimeout(() => {
					generateQuadTree();
					if (useNavAreas) generateNavAreasTree();
				}, 1000);

				console.log("quad tree generated");

				// If the mutation is a simple data-cactus-id attribute change, then scroll buttons are not updated
				if (mutation.type !== "attributes" || mutation.attributeName !== "data-cactus-id") {
					initScrollableElements(useNavAreas);
				} else {
					console.log("Mutation is data-cactus-id attribute change, skipping scrollable elements check");
				}

				//Reset flag to allow next callback execution on x ms
				setTimeout(() => {
					mutationObserverCallbackExecuting = false;
				}, 1000);
				break;
			}
		}
	});

	const mutationObserverOptions = {
		attributes: true, //necessary for collapsable elements etc...
		childList: true,
		subtree: true,
	};

	// Start observing the target node for configured mutations
	mutationObserver.observe(document.body, mutationObserverOptions);

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

window.cactusAPI.on('ipc-tabview-back', () => {
	window.history.back();
});

window.cactusAPI.on('ipc-tabview-forward', () => {
	window.history.forward();
});

function focusOnEditablePartOfElement(element) {
	if (!element) return; // No element found at the point

	// Helper to check if an element is editable
	const isEditable = (el) => {
		return (
			el.tagName === 'INPUT' ||
			el.tagName === 'TEXTAREA' ||
			el.isContentEditable
		);
	};

	// If the element itself is editable, focus it
	if (isEditable(element)) {
		element.focus();
		return;
	}

	// Check the closest editable ancestor
	const editableAncestor = element.closest('input, textarea, [contenteditable="true"]');
	if (editableAncestor) {
		editableAncestor.focus();
		return;
	}

	// Check for editable descendants
	const editableChild = element.querySelector('input, textarea, [contenteditable="true"]');
	if (editableChild) {
		editableChild.focus();
		return;
	}

	console.log('No editable element found at the given point.');
}

function getClickablePartOfElement(element) {
	if (!element) return; // No element found at the point

	// Define reusable constants
	const interactiveTags = [
		'BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL',
		'DETAILS', 'SUMMARY', 'DIALOG', 'OPTION', 'LEGEND', 'OUTPUT'
	];
	const interactiveRoles = [
		'button', 'link', 'checkbox', 'radio', 'tab', 'switch', 'menuitem',
		'gridcell', 'treeitem', 'combobox', 'slider', 'progressbar', 'menu',
		'menubar', 'toolbar', 'option'
	];

	// Helper to check if an element is inherently clickable or interactive
	const isClickable = (el) => {
		return (
			interactiveTags.includes(el.tagName) || // Common interactive HTML tags
			(interactiveRoles.includes(el.getAttribute('role'))) || // ARIA roles for interactivity
			el.hasAttribute('aria-haspopup') || // Indicates a popup trigger
			el.hasAttribute('aria-expanded') || // Accordion or dropdown control
			typeof el.onclick === 'function' || // Inline click handler
			el.hasAttribute('tabindex') // Explicitly focusable, including tabindex = -1
		);
	};

	// Generate a selector string based on interactive tags and roles
	const generateSelector = () => {
		const tagSelector = interactiveTags.map((tag) => tag.toLowerCase()).join(', ');
		const roleSelector = interactiveRoles.map((role) => `[role="${role}"]`).join(', ');
		const ariaSelector = '[aria-haspopup], [aria-expanded]';
		// Include elements with tabindex
		const tabindexSelector = '[tabindex]';
		return `${tagSelector}, ${roleSelector}, ${ariaSelector}, ${tabindexSelector}`;
	};

	const clickableSelector = generateSelector();

	// If the element itself is clickable, focus it
	if (isClickable(element)) {
		return element;
	}

	// Check the closest clickable ancestor
	const clickableAncestor = element.closest(clickableSelector);
	if (clickableAncestor) {
		return clickableAncestor;
	}

	// Check for clickable descendants
	const clickableChild = element.querySelector(clickableSelector);
	if (clickableChild) {
		return clickableChild;
	}

	console.log('No clickable or interactive element found.');
}



// This IPC event is triggered when the user submits the value inside the overlay keyboard.
// It attempts to find the element to update and sets the value to the submitted value.
window.cactusAPI.on('ipc-tabview-keyboard-input', (text, elementToUpdate) => {
	// element.focus();

	let element = document.querySelector('[data-cactus-id="' + elementToUpdate.id + '"]');

	if (!element)
		// Since the ID of the element may change at times, the element may instead be found using the x,y coordinates
		element = document.elementFromPoint(elementToUpdate.insertionPointX, elementToUpdate.insertionPointY);

	if (element) {
		// 	element = document.elementFromPoint(elementToUpdate.insertionPointX, elementToUpdate.insertionPointY);
		focusOnEditablePartOfElement(element);

		//JS is restricted when it comes to editing fields on remote pages - therefore, Robotjs is used to emulate the keyboard and mouse
		window.cactusAPI.send('robot-keyboard-type', text);
	} else {
		console.error("Element to update not found: ", elementToUpdate);
	}
});

window.cactusAPI.on('ipc-trigger-click-under-cursor', () => {
	const element = document.elementFromPoint(mousePos.x, mousePos.y);

	if (element) {
		//focusOnClickablePartOfElement(element);
		// //JS is restricted when it comes to interacting with elements on remote pages - therefore, Robotjs is used to emulate the keyboard and mouse
		// window.cactusAPI.send('robot-keyboard-enter');
		let clickableElement = getClickablePartOfElement(element);
		clickableElement.click();
	} else {
		console.error("Element to click under cursor has not been found");
	}
});

window.cactusAPI.onAsync('ipc-tabview-click-element', (elementToClick) => {
	let element = document.querySelector('[data-cactus-id="' + elementToClick.id + '"]');

	if (!element) {
		console.log("Element to click not found by cactus id");
		element = document.elementFromPoint(elementToClick.insertionPointX, elementToClick.insertionPointY);
	}

	if (element) {
		if (element.nodeName == 'A' && (element.getAttribute('href') && element.getAttribute('href') != '#'))
			window.cactusAPI.send('browse-to-url', element.getAttribute('href'));
		else {
			let clickableElement = getClickablePartOfElement(element);
			clickableElement.click();
		}
	} else {
		console.error("Element to click under cursor has not been found");
	}

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

	// element = document.querySelector('[data-cactus-id="' + elementToClick.id + '"]');

	// if (!element) {
	// 	console.log("Element to click not found by cactus id");
	// 	element = document.elementFromPoint(elementToClick.insertionPointX, elementToClick.insertionPointY);
	// }

	// if (element) {
	// 	//If it's a link - go to its href rather than relying on focusing/clicking (works nicely when anchor is hidden in some collapsable component)
	// 	if (element.nodeName == 'A' && (element.getAttribute('href') && element.getAttribute('href') != '#'))
	// 		window.cactusAPI.send('browse-to-url', element.getAttribute('href'));
	// 	else {
	// 		element.focus();
	// 		element.click();
	// 	}
	// } else {
	// 	console.error("Element to click not found by cactus id");
	// }
});

window.cactusAPI.onAsync('ipc-tabview-highlight-elements', (elementsToHighlight) => {
	elementsToHighlight.forEach(el => {
		// Each element is of type InteractiveElement whose id is set to the cactusId, hence we use el.id not el.dataset.cactusId
		var elementToMark = document.querySelector('[data-cactus-id="' + el.id + '"]');
		if (elementToMark) {
			if (!elementToMark.classList.contains('cactusElementVisualise')) {
				elementToMark.classList.add('cactusElementVisualise');
				setTimeout(function () {
					//cactusElementVisualiseRemoved class is necessary to filter out cactus-initiated attribute mutations and stop the QT being regenerated
					elementToMark.classList.add('cactusElementVisualiseRemoved');
					elementToMark.classList.remove('cactusElementVisualise');
				}, 800);
			}
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

function createCursor(id) {
	var cursor = document.createElement('div')
	var cursorHTML = `<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="eye" class="fa-eye fa-w-18" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M288 144a110.94 110.94 0 0 0-31.24 5 55.4 55.4 0 0 1 7.24 27 56 56 0 0 1-56 56 55.4 55.4 0 0 1-27-7.24A111.71 111.71 0 1 0 288 144zm284.52 97.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400c-98.65 0-189.09-55-237.93-144C98.91 167 189.34 112 288 112s189.09 55 237.93 144C477.1 345 386.66 400 288 400z"></path></svg>`;

	// The following step is needed due to the 'This document requires 'TrustedHTML' assignment' warning
	var trustedHTML = policy.createHTML(cursorHTML);

	cursor.innerHTML = trustedHTML;
	cursor.setAttribute('id', id)
	cursor.classList.add('cactus-cursor');

	// if (!id.localeCompare('hiddenCursor')) {
	//   cursor.style.opacity = 0
	// }

	document.body.appendChild(cursor);
}

function updateCursorPos() {
	var distX = mousePos.x - cursorPos.x
	var distY = mousePos.y - cursorPos.y

	cursorPos.x += distX / 10
	cursorPos.y += distY / 10

	cursor.style.left = cursorPos.x + 'px'
	cursor.style.top = cursorPos.y + 'px'
}

function followMouse() {
	// Get the current mouse position and update the variable 
	function setMouseXY(e) {
		mousePos.x = (window.Event) ? e.pageX : window.Event.clientX + (document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft);
		mousePos.y = (window.Event) ? e.pageY : window.Event.clientY + (document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop);
	}
	document.addEventListener('mousemove', setMouseXY, true) // each time the mouse moves, update the stored mouse coordinates

	// Increase interval to make it slower
	cursorInterval = setInterval(updateCursorPos, 20);
}

function generateUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

function initScrollableElements(useNavAreas) {
	removeExistingScrollButtons();

	// The list of scrollable elements is filtered so that only the <html> tag is considered if the <body> tag is also present, preventing overlapping scrolling buttons
	const scrollableElements = Array.from(document.querySelectorAll('*')).filter(element => {
		const style = window.getComputedStyle(element);
		return (
			(style.overflowY === 'scroll' || style.overflowY === 'auto') &&
			element.scrollHeight > element.clientHeight &&
			style.overflowY !== 'visible'
		);
	});

	console.log("Scrollable elements", scrollableElements);

	scrollableElements.forEach(element => {
		const targetZIndex = getZIndex(element);
		let quadtreeGeneratorTimer = null;

		// Scroll up button
		let scrollUpButton_outerDiv = document.createElement('div');
		scrollUpButton_outerDiv.classList.add('cactus-scrollUp_outerDiv');
		scrollUpButton_outerDiv.style.zIndex = `${targetZIndex + 1}`;

		let scrollUpButton = document.createElement('div');
		scrollUpButton.classList.add('cactus-scrollButton');
		scrollUpButton.style.top = '0';

		const keyboard_arrow_up = `<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#203a90"><path d="M480-554 304-378q-9 9-21 8.5t-21-9.5q-9-9-9-21.5t9-21.5l197-197q9-9 21-9t21 9l198 198q9 9 9 21t-9 21q-9 9-21.5 9t-21.5-9L480-554Z"/></svg>`;
		var trustedHTML = policy.createHTML(keyboard_arrow_up);
		scrollUpButton.innerHTML = trustedHTML;

		// When a mutation is observed and a new button is created to replace the previous button, then a check is made to see
		// whether the element has been previously scrolled or not. This is important because elements scrolled to the top should not have 
		// a scroll up button displayed.
		checkIfElementIsAtTop(element, scrollUpButton_outerDiv, scrollUpButton);

		// Scroll down button
		let scrollDownButton_outerDiv = document.createElement('div');
		scrollDownButton_outerDiv.classList.add('cactus-scrollDown_outerDiv'); // the classes are needed by the mutation observer
		scrollDownButton_outerDiv.style.zIndex = `${targetZIndex + 1}`;

		let scrollDownButton = document.createElement('div');
		scrollDownButton.classList.add('cactus-scrollButton');
		scrollDownButton.style.bottom = '0';
		scrollDownButton.style.display = 'flex';

		const keyboard_arrow_down = `<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#203a90"><path d="M480-356q-6 0-11-2t-10-7L261-563q-9-9-8.5-21.5T262-606q9-9 21.5-9t21.5 9l175 176 176-176q9-9 21-8.5t21 9.5q9 9 9 21.5t-9 21.5L501-365q-5 5-10 7t-11 2Z"/></svg>`;
		trustedHTML = policy.createHTML(keyboard_arrow_down);
		scrollDownButton.innerHTML = trustedHTML;

		// The same reasons for checking if element is at the top applies for checking if an element is at the bottom
		checkIfElementIsAtBottom(element, scrollDownButton_outerDiv, scrollDownButton);

		// When the scrollable element is the main body or the html tag, the buttons are centred and positioned to the top and bottom of the viewport,
		// taking only 1/3 of the screen width - all other elements take up the whole width of the parent element (the scrollable element).
		if (element.tagName === "HTML" || element.tagName === "BODY") {
			// Centering the scroll buttons and taking up 1/3 of the screen width
			scrollDownButton.style.width = 'calc((100% - 28px)/3)',
				scrollDownButton.style.left = '50%', // This positions the element's left edge at the center of the container
				scrollDownButton.style.transform = 'translateX(-50%)', // this moves the element back by half of its own width - combined with left: 50% the element is centered

				scrollUpButton.style.width = 'calc((100% - 28px)/3)',
				scrollUpButton.style.left = '50%',
				scrollUpButton.style.transform = 'translateX(-50%)'

			// Fixing the position to appear at the top and bottom of the viewport
			scrollUpButton_outerDiv.style.position = 'fixed';
			scrollDownButton_outerDiv.style.position = 'fixed';
		}

		scrollUpButton.onmouseenter = () => {
			isScrolling = true;
			cursor.style.visibility = 'hidden'; // Hiding the cursor when scrolling to avoid flickering
			smoothScroll('up', element);
			scrollUpButton.style.backgroundColor = '#003b776b';
		};

		scrollUpButton.onmouseleave = () => {
			isScrolling = false; // Stop scrolling on mouse leave
			cursor.style.visibility = 'visible'; // Show the cursor when scrolling stops
			scrollUpButton.style.backgroundColor = '#d7e3edbf';
		};

		scrollDownButton.onmouseenter = () => {
			isScrolling = true;
			cursor.style.visibility = 'hidden'; // Hiding the cursor when scrolling to avoid flickering
			smoothScroll('down', element);
			scrollDownButton.style.backgroundColor = '#003b776b';
		};

		scrollDownButton.onmouseleave = () => {
			isScrolling = false; // Stop scrolling on mouse leave
			cursor.style.visibility = 'visible'; // Show the cursor when scrolling stops
			scrollDownButton.style.backgroundColor = '#d7e3edbf';
		};

		function smoothScroll(direction, element = null) {
			const updatedScrollDistance = direction === 'down' ? scrollDistance : -scrollDistance;

			function step() {
				if (!isScrolling) {
					// clearInterval(quadtreeInterval);
					return; // Stop if scrolling is interrupted
				}
				else {
					// Start the timer to generate quadtree and navareas
					if (!quadtreeGeneratorTimer) {
						quadtreeGeneratorTimer = setTimeout(function () {
							generateQuadTree();
							if (useNavAreas) generateNavAreasTree();
							window.clearTimeout(quadtreeGeneratorTimer);
							quadtreeGeneratorTimer = null;
						}, 1000);
					}
				}

				checkIfElementIsAtTop(element, scrollUpButton_outerDiv, scrollUpButton);
				checkIfElementIsAtBottom(element, scrollDownButton_outerDiv, scrollDownButton);

				element.scrollBy({
					top: updatedScrollDistance,
					left: 0,
					behavior: "auto" // Smooth is disbaled here to avoid conflicting animations since we are using requestAnimationFrame()
				});

				requestAnimationFrame(step); // Keep scrolling while `isScrolling` is true
			}

			// Starts the scrolling animation
			step();
		}

		// The outer divs are parents of the actual button. They help with the positioning of the buttons on the screen.
		scrollUpButton_outerDiv.appendChild(scrollUpButton);
		element.insertBefore(scrollUpButton_outerDiv, element.firstChild); // Scroll up buttons are inserted as the first child
		scrollDownButton_outerDiv.appendChild(scrollDownButton);
		element.appendChild(scrollDownButton_outerDiv); // Scroll up buttons are inserted as the last child
	});

	function checkIfElementIsAtTop(element, scrollUpButton_outerDiv, scrollUpButton) {
		// if element is at the top, hide the scroll up button
		if (element.scrollTop === 0) {
			scrollUpButton_outerDiv.style.display = 'none';
			scrollUpButton.style.display = 'none';
		} else {
			scrollUpButton_outerDiv.style.display = 'block';
			scrollUpButton.style.display = 'flex';
		}
	}

	function checkIfElementIsAtBottom(element, scrollDownButton_outerDiv, scrollDownButton) {
		// if element is at the bottom, hide the scroll down button
		if (Math.floor(element.scrollHeight - element.scrollTop) === element.clientHeight) {
			scrollDownButton_outerDiv.style.display = 'none';
			scrollDownButton.style.display = 'none';
		} else {
			scrollDownButton_outerDiv.style.display = 'block';
			scrollDownButton.style.display = 'flex';
		}
	}
}

// This function is used to position the button on top of the element which it is scrolling
function getZIndex(element) {
	return parseInt(window.getComputedStyle(element).zIndex, 10) || 99999997; // Default to 99999997 if no z-index is set
}

function removeExistingScrollButtons() {
	const existingScrollButtons = Array.from(
		document.querySelectorAll('.cactus-scrollButton, .cactus-scrollDown_outerDiv, .cactus-scrollUp_outerDiv')
	);
	console.log("Existing scroll buttons", existingScrollButtons);
	existingScrollButtons.forEach(button => button.remove());
	iterator++;
	if (existingScrollButtons) console.log("Removed existing scroll buttons for the " + iterator + " time");
}

// Gets the contents needed from the renderer process and sends them to the main process for generating the QuadTree
function generateQuadTree() {
	const clickableSelectors = [
		'button', 'a', 'textarea', 'input', 'select', 'date',
		'div[role="button"]', 'span[role="button"]', 'div[role="link"]', 'span[role="link"]',
		'[role="checkbox"]', '[role="textbox"]', '[role="radio"]', '[role="option"]', '[role="tab"]',
		'[role="menu"]', '[role="switch"]', '[role="slider"]', '[role="combobox"]'
	];
	const clickableElements = Array.from(document.querySelectorAll(clickableSelectors.join(', ')));
	const visibleElements = filterVisibleElements(clickableElements).map(e => {
		if (!e.dataset.cactusId) {
			// console.log("Cactus Id of element", e, ", is empty");
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
		ariaLabel: element.getAttribute('aria-label'),
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