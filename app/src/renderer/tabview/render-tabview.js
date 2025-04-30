var mousePos = { x: 0, y: 0 }
var cursorPos = { x: 0, y: 0 }
let cursor;
let cursorInterval;
let scrollDistance;
let isScrolling = false;
let isScrollingUsingButtons = false;
let iterator = 0;
let useNavAreas;
let scrollTimeout;
let mutationObserver;
let mutationObserverOptions;
let displayScrollButtons = true;
let previousDuration;
let isMutationObserverActive;

// Create a Trusted Types policy for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
const policy = window.trustedTypes.createPolicy('cactus_defaultPolicy', {
	// This method returns the input as is, without any sanitization
	// but adds a TrustedHTML wrapper around the content
	createHTML: (input) => input
});

// Init cursor
try {
	createCursor('cactus_cursor');
	cursor = document.getElementById('cactus_cursor');
	followMouse('cactus_cursor');
} catch (error) {
	window.cactusAPI.logError(`Error initializing cursor: ${error.message}`);
}

window.cactusAPI.on('ipc-iframes-loaded', (scrollDist) => {
	try {
		sendMessageToIframes('ipc-iframes-loaded', { scrollDist });
	} catch (error) {
		window.cactusAPI.logError(`Error handling 'ipc-iframes-loaded': ${error.message}`);
	}
});

window.cactusAPI.on('ipc-main-tabview-loaded', (useNavAreas, scrollDist, isActive) => {
	try {
		useNavAreas = useNavAreas;
		scrollDistance = scrollDist;
		initScrollableElements();

		// Setup the QuadTree and NavAreasTree
		generateQuadTree();
		if (useNavAreas) generateNavAreasTree();

		// Setup mutation observer to detect changes in the DOM
		// EXPERIMENTAL - JS EVENTS (E.g. click on tab element, does not fire up (although it's firing up changes in quick succession when banners change etc...) - to test properly)
		let mutationObserverCallbackExecuting = false;
		// Create an observer instance linked to the callback function
		mutationObserver = new MutationObserver((mutationsList) => {
			try {
				// If callback is already executing, ignore this invocation
				if (mutationObserverCallbackExecuting) return;

				// Iterate through the list of mutations, and only generate quadTrees when: 
				// a) not custom Cursor related (debounce every x ms to avoid too many quadtree gen calls)
				// b) not a known attribute being added/removed
				for (let mutation of mutationsList) {
					const isCactusInternalElement = (node) => {
						if (!(node instanceof HTMLElement)) return false;
						return (
							node.id === 'cactus_cursor' ||
							node.classList.contains('cactusElementVisualise') ||
							node.classList.contains('cactusElementVisualiseRemoved') ||
							node.classList.contains('cactus-element-highlight') ||
							node.classList.contains('cactus-scrollButton') ||
							node.classList.contains('cactus-scrollUp_outerDiv') ||
							node.classList.contains('cactus-scrollDown_outerDiv')
						);
					};
		
					const allAddedAreCactusElements = [...mutation.addedNodes].every(isCactusInternalElement);
					const allRemovedAreCactusElements = [...mutation.removedNodes].every(isCactusInternalElement);
		
					// Skips this mutation if ONLY internal CACTUS elements were added or removed
					if (allAddedAreCactusElements && allRemovedAreCactusElements) continue;
		
					console.log(`Mutation observed on target: `, mutation.target, `\nMutation type: `, mutation.type);
					mutationObserverCallbackExecuting = true;
		
					setTimeout(() => {
						try {
							generateQuadTree();
							if (useNavAreas) generateNavAreasTree();
							sendMessageToIframes('ipc-iframes-loaded', { scrollDist });
						} catch (error) {
							window.cactusAPI.logError(`Error generating QuadTree/NavAreasTree: ${error.message}`);
						}
					}, 1000);
		
					console.log("quad tree generated");
		
					if (mutation.type !== "attributes" || mutation.attributeName !== "data-cactus-id") {
						initScrollableElements();
					} else {
						console.log("Mutation is data-cactus-id attribute change, skipping scrollable elements check");
					}
		
					setTimeout(() => {
						mutationObserverCallbackExecuting = false;
					}, 1000);
		
					break;
				}
			} catch (error) {
				window.cactusAPI.logError(`Error in mutation observer callback: ${error.message}`);
			}
		});		

		mutationObserverOptions = {
			attributes: true, //necessary for collapsable elements etc...
			childList: true,
			subtree: true,
		};

		// Start observing the target node for configured mutations if the tab is active
		if (isActive) {
			try {
				mutationObserver.observe(document.body, mutationObserverOptions);
				isMutationObserverActive = true;
			} catch (error) {
				window.cactusAPI.logError(`Error starting mutation observer: ${error.message}`);
			}
		}

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
	} catch (error) {
		window.cactusAPI.logError(`Error in 'ipc-main-tabview-loaded': ${error.message}`);
	}
});

window.cactusAPI.on('ipc-main-disconnect-mutation-observer', async () => {
	try {
		console.log("============= Mutation observer disconnected ==================");
		isMutationObserverActive = false;
		await mutationObserver.disconnect();
	} catch (error) {
		window.cactusAPI.logError(`Error disconnecting mutation observer: ${error.message}`);
	}
});


window.cactusAPI.on('ipc-main-reconnect-mutation-observer', async () => {
	try {
		console.log("============= Mutation observer reconnected ==================");
		isMutationObserverActive = true;
		await mutationObserver.observe(document.body, mutationObserverOptions);
	} catch (error) {
		window.cactusAPI.logError(`Error reconnecting mutation observer: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-main-add-scroll-buttons', () => {
	try {
		displayScrollButtons = true;
		initScrollableElements();
	} catch (error) {
		window.cactusAPI.logError(`Error adding scroll buttons: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-main-remove-scroll-buttons', () => {
	try {
		displayScrollButtons = false;
		removeExistingScrollButtons();
	} catch (error) {
		window.cactusAPI.logError(`Error removing scroll buttons: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-clear-highlighted-elements', () => {
	try {
		// Remove all previous points with class "point"
		const previousPoints = document.querySelectorAll('.cactus-element-highlight');
		previousPoints.forEach(point => point.remove());
	} catch (error) {
		window.cactusAPI.logError(`Error clearing highlighted elements: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-highlight-available-elements', (contents) => {
	try {
		const { elementsInView, dwellRangeWidth, dwellRangeHeight, color } = contents;
		elementsInView.forEach(ve => {
			highlightAvailableElements(ve.x, ve.y, ve.width, ve.height, color, dwellRangeWidth, dwellRangeHeight);
		});
	} catch (error) {
		window.cactusAPI.logError(`Error highlighting available elements: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-tabview-update-scroll-distance', (newScrollDistance) => {
	try {
		scrollDistance = newScrollDistance;
		initScrollableElements();
	} catch (error) {
		window.cactusAPI.logError(`Error updating scroll distance: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-tabview-back', () => {
	try {
		window.history.back();
	} catch (error) {
		window.cactusAPI.logError(`Error navigating back: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-tabview-forward', () => {
	try {
		window.history.forward();
	} catch (error) {
		window.cactusAPI.logError(`Error navigating forward: ${error.message}`);
	}
});

// This IPC event is triggered when the user submits the value inside the overlay keyboard.
// It attempts to find the editable part of the element to update and types the text into it using Robotjs
window.cactusAPI.on('ipc-tabview-keyboard-input', (text, elementToUpdate, submit, updateValueAttr) => {
	try {
		// element.focus();

		let element = document.querySelector('[data-cactus-id="' + elementToUpdate.id + '"]');

		if (!element)
			// Since the ID of the element may change at times, the element may instead be found using the x,y coordinates
			element = document.elementFromPoint(elementToUpdate.insertionPointX, elementToUpdate.insertionPointY);

		if (element) {
			// The focus is set on the editable part of the element so that the text can be typed into it using Robotjs
			let editablePart = getEditablePartOfElement(element);
			if (editablePart) editablePart.focus();

			if (updateValueAttr) {
				console.log('Updating element with text: ', text);
				element.value = text;
				console.log('Element.value after: ', element.value);
				if (submit) window.cactusAPI.send('robot-keyboard-enter');
			} else {
				console.log('Typing text using RobotJS: ', text);
			//JS is restricted when it comes to editing fields on remote pages - therefore, Robotjs is used to emulate the keyboard and mouse
				window.cactusAPI.send('robot-keyboard-type', { text, submit });
			}
		} else {
			window.cactusAPI.logError(`Element to update not found: ${elementToUpdate}`);
		}
	} catch (error) {
		window.cactusAPI.logError(`Error handling keyboard input: ${error.message}`);
	}
});

window.cactusAPI.onAsync('ipc-tabview-set-element-value', (element, value) => {
	try {
		let parentElement = document.querySelector('[data-cactus-id="' + element.parentElementId + '"]');
		debugger
		if (parentElement) {
			if (parentElement.multiple) {
				// When a select element has the multiple attribute, it is possible to select more than one option
				Array.from(parentElement.options).forEach(option => {
					if (value === option.value) {
						// If the option is already selected, deselect it
						option.selected = !option.selected;
					}
				});
			} else if (parentElement.tagName.toLowerCase() === 'video' || parentElement.tagName.toLowerCase() === 'audio') {
				// If the element is a video, update the video attributes accordingly
				if (value === 'pausePlay') {
					parentElement.paused = parentElement.paused ? parentElement.play() : parentElement.pause();
				} else if (value === 'muteUnmute') {
					parentElement.muted = !parentElement.muted;
				} else if (element.parentValue === 'volume') {
					parentElement.volume = parseFloat(value);
				} else if (element.parentValue === 'seek') {
					parentElement.currentTime = parseFloat(value);
				}
			} else {
				// Handle single selection
				parentElement.value = value;

				// Ensure the correct option is selected if setting value alone doesn’t work
				const optionToSelect = Array.from(parentElement.options).find(opt => opt.value === value);
				if (optionToSelect) {
					optionToSelect.selected = true;
				}

				// Trigger change event to make sure it's registered
				parentElement.dispatchEvent(new Event('change', { bubbles: true }));
			}
		}
	} catch (error) {
		window.cactusAPI.logError(`Error setting element value: ${error.message}`);
	}
});

window.cactusAPI.onAsync('ipc-tabview-highlight-elements', (elementsToHighlight) => {
	try {
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
	} catch (error) {
		window.cactusAPI.logError(`Error highlighting elements: ${error.message}`);
	}
});

window.cactusAPI.on('ipc-tabview-create-quadtree', (useNavAreas) => {
	try {
		// //ISSUES: Node-Config is required by Cactus, and the config/default.json file would need to be recreated on cactus itself, rather than just the builder code. Which might not be a bad idea. Think about it.
		console.log("Creating QuadTree and NavAreasTree");
		generateQuadTree();
		if (useNavAreas) generateNavAreasTree();
	} catch (error) {
		window.cactusAPI.logError(`Error creating QuadTree/NavAreasTree: ${error.message}`);
	}
});

window.addEventListener('message', (event) => {
	try {
		if (event.data.message === 'ipc-iframe-cursor-mouseenter') {
			console.log("ipc-iframe-cursor-mouseenter");
			cursor.style.visibility = 'hidden'
			window.cactusAPI.send('ipc-iframe-cursor-mouseenter', event.data.contents);
		}
		if (event.data.message === 'ipc-iframe-cursor-mouseleave') {
			console.log("ipc-iframe-cursor-mouseleave");
			cursor.style.visibility = 'visible'
			window.cactusAPI.send('ipc-iframe-cursor-mouseleave');
		}
	} catch (error) {
		window.cactusAPI.logError(`Error handling iframe message: ${error.message}`);
	}
});

// This is useful for elements that scroll the page when they are clicked (like a scroll to top button)
// and for any other scrolling not done through the scrolling buttons displayed on-screen.
window.addEventListener('scroll', () => {
	try {
		// At times, this event listener is triggered when the user scrolls using the scrolling buttons, but other times it is not 
		// (because the scroll buttons would be for another element that is not the main window). To prevent multiple quadtree 
		// generations, if the user is scrolling using the buttons, the QuadTree/NavAreasTree is generated elsewhere (inside the step function).
		if (!isScrollingUsingButtons) {
			if (scrollTimeout) {
				clearTimeout(scrollTimeout);
			}
			scrollTimeout = setTimeout(() => {
				generateQuadTree();
				if (window.useNavAreas) generateNavAreasTree();
			}, 500);
		}
	} catch (error) {
		window.cactusAPI.logError(`Error handling scroll event: ${error.message}`);
	}
});

function createCursor(id) {
	try {
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
	} catch (error) {
		window.cactusAPI.logError(`Error creating cursor: ${error.message}`);
	}
}

function updateCursorPos() {
	try {
		var distX = mousePos.x - cursorPos.x
		var distY = mousePos.y - cursorPos.y

		cursorPos.x += distX / 10
		cursorPos.y += distY / 10

		cursor.style.left = cursorPos.x + 'px'
		cursor.style.top = cursorPos.y + 'px'
	} catch (error) {
		window.cactusAPI.logError(`Error updating cursor position: ${error.message}`);
	}
}

function followMouse() {
	try {
		// Get the current mouse position and update the variable 
		function setMouseXY(e) {
			mousePos.x = (window.Event) ? e.pageX : window.Event.clientX + (document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft);
			mousePos.y = (window.Event) ? e.pageY : window.Event.clientY + (document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop);
		}
		document.addEventListener('mousemove', setMouseXY, true) // each time the mouse moves, update the stored mouse coordinates

		// Increase interval to make it slower
		cursorInterval = setInterval(updateCursorPos, 20);
	} catch (error) {
		window.cactusAPI.logError(`Error following mouse: ${error.message}`);
	}
}

function generateUUID() {
	try {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			const r = Math.random() * 16 | 0;
			const v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	} catch (error) {
		window.cactusAPI.logError(`Error generating UUID: ${error.message}`);
	}
}

function initScrollableElements() {
	try {
		if (displayScrollButtons) {
			removeExistingScrollButtons();

			// The list of scrollable elements is filtered so that only the <html> tag is considered if the <body> tag is also present, preventing overlapping scrolling buttons
			const scrollableElements = Array.from(document.querySelectorAll('*')).filter(element => {
				const style = window.getComputedStyle(element);
				return (
					(style.overflowY === 'scroll' || style.overflowY === 'auto') &&
					element.scrollHeight >= element.clientHeight &&
					style.overflowY !== 'visible'
				);
			});

			console.log("Scrollable elements", scrollableElements);

			scrollableElements.forEach(element => {
				const targetZIndex = getZIndex(element);

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
							isScrollingUsingButtons = false;
							generateQuadTree();
							if (window.useNavAreas) generateNavAreasTree();

							return; // Stop if scrolling is interrupted
						}

						isScrollingUsingButtons = true; // Set the flag to indicate scrolling is in progress
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
	} catch (error) {
		window.cactusAPI.logError(`Error initializing scrollable elements: ${error.message}`);
	}
}

// This function is used to position the sccroll button on top of the element which it is scrolling
function getZIndex(element) {
	try {
		return parseInt(window.getComputedStyle(element).zIndex, 10) || 2147483648; // Default to 99999997 if no z-index is set
	} catch (error) {
		window.cactusAPI.logError(`Error getting z-index: ${error.message}`);
	}
}

function removeExistingScrollButtons() {
	try {
		const existingScrollButtons = Array.from(
			document.querySelectorAll('.cactus-scrollButton, .cactus-scrollDown_outerDiv, .cactus-scrollUp_outerDiv')
		);
		console.log("Existing scroll buttons", existingScrollButtons);
		existingScrollButtons.forEach(button => button.remove());
		iterator++;
		if (existingScrollButtons) console.log("Removed existing scroll buttons for the " + iterator + " time");
	} catch (error) {
		window.cactusAPI.logError(`Error removing existing scroll buttons: ${error.message}`);
	}
}

// Gets the contents needed from the renderer process and sends them to the main process for generating the QuadTree
async function generateQuadTree() {
	try {
		const clickableSelectors = [
			'button', 'a:not([tabindex="-1"])', 'textarea', 'input', 'select', 'date', 'video', 'audio',
			'[role="button"]', 'div[role="link"]', 'span[role="link"]',
			'[role="checkbox"]', '[role="textbox"]', '[role="radio"]', '[role="option"]', '[role="tab"]',
			'[role="menu"]', '[role="switch"]', '[role="slider"]', '[role="combobox"], iframe[src]', '[aria-selected]'
		];
		const clickableElements = Array.from(document.querySelectorAll(clickableSelectors.join(', ')));
		const visibleElements = filterVisibleElements(clickableElements).map(e => {
			if (!e.dataset.cactusId) {
				// console.log("Cactus Id of element", e, ", is empty");
				e.dataset.cactusId = generateUUID();
			}

			// Add ondurationchange event listener for video elements
			if (e.tagName.toLowerCase() === 'video') {
				e.addEventListener('durationchange', () => {
					try {
						if (e.duration != previousDuration) {
							// Update rangeValues for the serialized element
							previousDuration = e.duration;
							const duration = e.duration;
							const updatedRangeValues = [];

							if (duration) {
								for (let i = 1; i <= 10; i++) { // Loop from 10% to 100%
									const time = (i / 10) * duration; // Calculate the time for each percentile
									updatedRangeValues.push({
										value: time.toFixed(2), // Keep precision for fractional seconds
										textContent: new Date(time * 1000).toISOString().slice(11, 19), // Convert seconds to HH:mm:ss
										parentElementId: e.dataset.cactusId,
										parentValue: 'seek',
									});
								}
							}

							// Find the corresponding serialized element and update its rangeValues
							const serializedElement = serializedElements.find(el => el.cactusId === e.dataset.cactusId);
							if (serializedElement) {
								serializedElement.videoAudioOptions[3].rangeValues = updatedRangeValues;
								window.cactusAPI.send('ipc-tabview-clear-sidebar');
								if (pageData && isMutationObserverActive) window.cactusAPI.send('ipc-tabview-generateQuadTree', pageData);
							}
						}
					} catch (error) {
						window.cactusAPI.logError(`Error handling video duration change: ${error.message}`);
					}
				});
			}

			return e;
		});
		// console.log("Visible elements", visibleElements);
		const serializedElements = visibleElements.map(serializeElement); //creating an element object for each element in the array

		const pageData = {
			serializedVisibleElements: serializedElements,
			docTitle: document.title,
			docURL: document.URL
		};
		window.cactusAPI.send('ipc-tabview-generateQuadTree', pageData);
	} catch (error) {
		window.cactusAPI.logError(`Error generating QuadTree: ${error.message}`);
	}
}

// Gets the contents needed from the renderer process and sends them to the main process to generate the NavAreasTree
function generateNavAreasTree() {
	try {
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
	} catch (error) {
		window.cactusAPI.logError(`Error generating NavAreasTree: ${error.message}`);
	}
}

// This serializes relevant properties of the elements
function serializeElement(element) {
	try {
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
			rangeValues: (() => {
				if (element.tagName === 'RANGE') {
					const min = parseFloat(element.getAttribute("min") || element.getAttribute("ariaValueMin") || "0");
					const max = parseFloat(element.getAttribute("max") || element.getAttribute("ariaValueMax") || "100");
					const step = parseFloat(element.getAttribute("step") || "1");
					const values = [];
					for (let i = min; i <= max; i += step) {
						values.push({
							value: i.toString(),
							textContent: i,
							parentElementId: element.dataset.cactusId,
						});
					}
					return values;
				}
				return [];
			})(),
			title: element.title,
			href: element.getAttribute('href'),
			src: element.getAttribute('src'),
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
					value: option.value,
					textContent: option.textContent,
					parentElementId: element.dataset.cactusId,
					type: 'option'
				};
			}) : null,
			nodeType: element.nodeType,
			childNodes: element.childNodes ? Array.from(element.childNodes).map(serializeChildNode) : null,
			videoAudioOptions: (element.tagName === 'VIDEO' || element.tagName === 'AUDIO') ? [
				{
					value: 'pausePlay',
					textContent: 'Pause/Play',
					parentElementId: element.dataset.cactusId,
					type: 'pausePlay',
				},
				{
					value: 'muteUnmute',
					textContent: 'Mute/Unmute',
					parentElementId: element.dataset.cactusId,
					type: 'muteUnmute',
				},
				{
					value: 'volume',
					textContent: 'Volume',
					parentElementId: element.dataset.cactusId,
					parentType: element.tagName.toLowerCase(),
					type: 'range',
					rangeValues: (() => {
						const min = parseFloat(element.getAttribute("min") || "0");
						const max = parseFloat(element.getAttribute("max") || "1.01");
						const step = parseFloat(element.getAttribute("step") || "0.01");
						const values = [];
						for (let i = min; i <= max; i += step) {
							values.push({
								value: i.toFixed(2),
								textContent: (i * 100).toFixed(0).toString() + "%",
								parentElementId: element.dataset.cactusId,
								parentValue: 'volume',
							});
						}
						return values;
					})(),
				},
				{
					value: 'seek',
					textContent: 'Seek',
					parentElementId: element.dataset.cactusId,
					parentType: element.tagName.toLowerCase(),
					type: 'range',
					rangeValues: (() => {
						const duration = element.duration;
						const values = [];

						if (duration) {
							for (let i = 1; i <= 10; i++) { 
								const time = (i / 10) * duration; 
								values.push({
									value: time.toFixed(2), 
									textContent: new Date(time * 1000).toISOString().slice(11, 19),
									parentElementId: element.dataset.cactusId,
									parentValue: 'seek',
								});
							}
							return values;
						}
					})(),
				}
			] : null
		};
	} catch (error) {
		window.cactusAPI.logError(`Error serializing element: ${error.message}`);
	}
}

function serializeChildNode(node) {
	try {
		return {
			nodeType: node.nodeType,
			nodeValue: node.nodeValue,
			tagName: node.tagName,
			alt: node.alt,
			childNodes: node.childNodes ? Array.from(node.childNodes).map(serializeChildNode) : null
		};
	} catch (error) {
		window.cactusAPI.logError(`Error serializing child node: ${error.message}`);
	}
}

function serializeMenuElement(element) {
	try {
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
	} catch (error) {
		window.cactusAPI.logError(`Error serializing menu element: ${error.message}`);
	}
}

// This filters out elements that are not visible (in viewport) or have no dimensions, or which are disabled
function filterVisibleElements(elements) {
	try {
		return elements.filter(element => {
			const style = window.getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return (
				style &&
				style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				element.offsetWidth > 0 &&
				element.offsetHeight > 0 &&
				//Checking if element is, at least partly, within the viewport
				(
					rect.x <= (window.innerWidth || document.documentElement.clientWidth) &&
					rect.x + rect.width >= 0 &&
					rect.y <= (window.innerHeight || document.documentElement.clientHeight) &&
					rect.y + rect.height >= 0

				) &&
				element.disabled !== true
			);
		});
	} catch (error) {
		window.cactusAPI.logError(`Error filtering visible elements: ${error.message}`);
	}
}

function highlightAvailableElements(x, y, width, height, color, dwellingRangeWidth, dwellingRangeHeight) {
	try {
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
	} catch (error) {
		window.cactusAPI.logError(`Error highlighting available elements: ${error.message}`);
	}
}

function getEditablePartOfElement(element) {
	try {
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
			return element;
		}

		// Check the closest editable ancestor
		const editableAncestor = element.closest('input, textarea, [contenteditable="true"]');
		if (editableAncestor) {
			return editableAncestor;
		}

		// Check for editable descendants
		const editableChild = element.querySelector('input, textarea, [contenteditable="true"]');
		if (editableChild) {
			return editableChild;
		}

		console.log('No editable element found at the given point.');
	} catch (error) {
		window.cactusAPI.logError(`Error getting editable part of element: ${error.message}`);
	}
}

// function getClickablePartOfElement(element) {
// 	try {
// 		if (!element) return; // No element found at the point

// 		// Define reusable constants
// 		const interactiveTags = [
// 			'BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL',
// 			'DETAILS', 'SUMMARY', 'DIALOG', 'OPTION', 'LEGEND', 'OUTPUT'
// 		];
// 		const interactiveRoles = [
// 			'button', 'link', 'checkbox', 'radio', 'tab', 'switch', 'menuitem',
// 			'treeitem', 'combobox', 'slider', 'progressbar', 'menu',
// 			'menubar', 'toolbar', 'option'
// 		];

// 		// Helper to check if an element is inherently clickable or interactive
// 		const isClickable = (el) => {
// 			return (
// 				interactiveTags.includes(el.tagName) || // Common interactive HTML tags
// 				(interactiveRoles.includes(el.getAttribute('role'))) || // ARIA roles for interactivity
// 				el.hasAttribute('aria-haspopup') || // Indicates a popup trigger
// 				el.hasAttribute('aria-expanded') || // Accordion or dropdown control
// 				el.hasAttribute('aria-labelledby') || // Interactive labelled control
// 				typeof el.onclick === 'function' || // Inline click handler
// 				//el.hasAttribute('tabindex') || // Explicitly focusable, including tabindex = -1
// 				el.hasAttribute('jsaction') // Google's interactive action attributes
// 			);
// 		};

// 		// Generate a selector string based on interactive tags and roles
// 		const generateSelector = () => {
// 			const tagSelector = interactiveTags.map((tag) => tag.toLowerCase()).join(', ');
// 			const roleSelector = interactiveRoles.map((role) => `[role="${role}"]`).join(', ');
// 			const ariaSelector = '[aria-haspopup], [aria-expanded], [aria-labelledby]';
// 			// Include elements with tabindex
// 			//const tabindexSelector = '[tabindex]';
// 			const jsactionSelector = '[jsaction]'; // Add jsaction to the selector
// 			//return `${tagSelector}, ${roleSelector}, ${ariaSelector}, ${tabindexSelector}, ${jsactionSelector}`;
// 			return `${tagSelector}, ${roleSelector}, ${ariaSelector}, ${jsactionSelector}`;
// 		};

// 		const clickableSelector = generateSelector();

// 		//Sometimes, certain selectable elements, such as 'option', might have clickable descendants (e.g. div role=button)
// 		const clickableChild = element.querySelector(clickableSelector);
// 		console.log('Clickable child:', clickableChild);
// 		if (clickableChild) {
// 			return clickableChild;
// 		}

// 		// If the element itself is clickable, click it
// 		if (isClickable(element)) {
// 			console.log('Element is clickable:', element);
// 			return element;
// 		}

// 		// Check the closest clickable ancestor
// 		const clickableAncestor = element.closest(clickableSelector);
// 		console.log('Clickable ancestor:', clickableAncestor);
// 		if (clickableAncestor) {
// 			return clickableAncestor;
// 		}

// 		// Checking for the presence of a dynamic onclick event handler
// 		const elementWithClickEvent = getElementWithClickEvent(element);
// 		if (elementWithClickEvent) {
// 			return elementWithClickEvent;
// 		}

// 		console.log('No clickable or interactive element found.');
// 	} catch (error) {
// 		window.cactusAPI.logError(`Error getting clickable part of element: ${error.message}`);
// 	}
// }

// function getElementWithClickEvent(element) {
// 	try {
// 		// Checking if the current element has an onclick event attached
// 		if (!!element.onclick) {
// 			console.log("We found the element by its onclick event");
// 			return element;
// 		}

// 		// Recursively checking child elements
// 		for (const child of element.children) {
// 			const clickableChild = getElementWithClickEvent(child);
// 			if (clickableChild) {
// 				return clickableChild;
// 			}
// 		}

// 		// Return null if no element with onclick is found
// 		return null;
// 	} catch (error) {
// 		window.cactusAPI.logError(`Error getting element with click event: ${error.message}`);
// 	}
// }

function sendMessageToIframes(message, contents = {}) {
	try {
		document.querySelectorAll('iframe').forEach(iframe => {
			if (iframe.hasAttribute('src') && iframe.getAttribute('src') !== 'about:blank') { // Check if the iframe has a src attribute
				console.log("Sending message to iframe", iframe);
				iframe.contentWindow.postMessage({ message, ...contents }, '*');
			}
		});
	} catch (error) {
		window.cactusAPI.logError(`Error sending message to iframes: ${error.message}`);
	}
}