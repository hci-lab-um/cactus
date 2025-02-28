(function () {
	console.log('------------------ WE DID IT! 🥳 ------------------');

	// Inject script to hide the native mouse in the iframe
	document.body.style.cursor = "none";
	const style = document.createElement('style');
	style.innerHTML = 'a, input, textarea, button, div { cursor: none !important; }';
	document.head.appendChild(style);

	var mousePos = { x: 0, y: 0 }
	var cursorPos = { x: 0, y: 0 }
	let cursor;
	let cursorInterval;
	let scrollDistance;
	let isScrolling = false;
	let iterator = 0;

	// Create a Trusted Types policy for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
	const policy = window.trustedTypes.createPolicy('defaultPolicy', {
		// This method returns the input as is, without any sanitization
		// but adds a TrustedHTML wrapper around the content
		createHTML: (input) => input
	});

	// Init cursor
	createCursor('cactus_cursor');
	cursor = document.getElementById('cactus_cursor');
	followMouse('cactus_cursor');

	function createCursor(id) {
		var cursor = document.createElement('div')
		var cursorHTML = `<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="eye" class="fa-eye fa-w-18" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M288 144a110.94 110.94 0 0 0-31.24 5 55.4 55.4 0 0 1 7.24 27 56 56 0 0 1-56 56 55.4 55.4 0 0 1-27-7.24A111.71 111.71 0 1 0 288 144zm284.52 97.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400c-98.65 0-189.09-55-237.93-144C98.91 167 189.34 112 288 112s189.09 55 237.93 144C477.1 345 386.66 400 288 400z"></path></svg>`;

		// The following step is needed due to the 'This document requires 'TrustedHTML' assignment' warning
		var trustedHTML = policy.createHTML(cursorHTML);

		cursor.innerHTML = trustedHTML;
		cursor.setAttribute('id', id)
		cursor.classList.add('cactus-cursor') // this is needed for the mutation observer to filter out the cursor from the mutations
		cursor.style.position = 'absolute'
		cursor.style.pointerEvents = 'none'
		cursor.style.zIndex = '9999999999'
		cursor.style.opacity = '0.4'
		cursor.style.width = '50px'
		cursor.style.height = '50px'
		cursor.style.color = '#a091eb'
		cursor.style.margin = '-20px 0 0 -20px'

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

	function initScrollableElements() {
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

		scrollableElements.forEach(element => {
			const targetZIndex = getZIndex(element);

			const cactus_scrollButton_style = {
				position: 'absolute',
				margin: '14px',
				width: 'calc(100% - 28px)',
				alignItems: 'center',
				justifyContent: 'center',
				padding: '10px',
				fontSize: '20px',
				borderRadius: '6px',
				backgroundColor: '#d7e3edbf',
				transition: 'all 0.5s ease 0s'
			};

			// Scroll up button
			let scrollUpButton_outerDiv = document.createElement('div');
			scrollUpButton_outerDiv.classList.add('cactus-scrollUp_outerDiv');
			scrollUpButton_outerDiv.style.zIndex = `${targetZIndex + 1}`;
			scrollUpButton_outerDiv.style.position = 'sticky';
			scrollUpButton_outerDiv.style.top = '0';
			scrollUpButton_outerDiv.style.width = '100%';

			let scrollUpButton = document.createElement('div');
			scrollUpButton.classList.add('cactus-scrollButton');
			scrollUpButton.style.top = '0';
			for (const property in cactus_scrollButton_style) {
				scrollUpButton.style[property] = cactus_scrollButton_style[property];
			}

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
			scrollDownButton_outerDiv.style.position = 'sticky';
			scrollDownButton_outerDiv.style.bottom = '0';
			scrollDownButton_outerDiv.style.width = '100%';
			
			let scrollDownButton = document.createElement('div');
			scrollDownButton.classList.add('cactus-scrollButton');
			scrollDownButton.style.bottom = '0';
			scrollDownButton.style.display = 'flex';
			for (const property in cactus_scrollButton_style) {
				scrollDownButton.style[property] = cactus_scrollButton_style[property];
			}

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
						return;
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
		return parseInt(window.getComputedStyle(element).zIndex, 10) || 2147483648; // Default to 99999997 if no z-index is set
	}

	function removeExistingScrollButtons() {
		const existingScrollButtons = Array.from(
			document.querySelectorAll('.cactus-scrollButton, .cactus-scrollDown_outerDiv, .cactus-scrollUp_outerDiv')
		);
		existingScrollButtons.forEach(button => button.remove());
	}	

	function iframeLoaded(scrollDist) {
		console.log('---- iframe loaded ----');
		scrollDistance = scrollDist;
		initScrollableElements();

		// Handle mouse behaviour on iframe
		iframe = document.getRootNode();

		iframe.addEventListener('mouseenter', (event) => {
			cursor.style.visibility = 'visible'
			window.parent.postMessage({ message: 'ipc-iframe-cursor-mouseenter', contents: { x: event.clientX, y: event.clientY } }, '*');
		});

		iframe.addEventListener('mouseleave', () => {
			cursor.style.visibility = 'hidden'
			window.parent.postMessage({ message: 'ipc-iframe-cursor-mouseleave', contents: { x: event.clientX, y: event.clientY } }, '*');
		});
	}

	window.addEventListener('message', (event) => {
		if (!event.data || !event.data.message) return;
		
		if (event.data.message === 'ipc-iframes-loaded') {
			iframeLoaded(event.data.scrollDist);
		}
	});
})();