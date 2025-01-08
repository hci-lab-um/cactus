// const fs                        = require('original-fs')
// const path                      = require('path')
const { ipcRenderer } = require('electron')
const { byId, dwell } = require('../../tools/utils')
const config = require('config');
// const { byId, readFile, dwell } = require('./js/utils')
// const { drop, isEqual }         = require('lodash')
// const Config                    = require('./js/config')
const { createCursor, followCursor, getMouse } = require('../../tools/cursor')
const DOMPurify = require('dompurify');

// let backOrForward, browserviewContainer
// let cancelNavBtn, backNavBtn, forwardNavBtn, overlayNav
// let dialog, dialogMessage, dialogErrorIcon, dialogSuccessIcon

// let webviewContainer

//Omnibox - combined location and search field 
// let omni = byId('url')

let omni, navbar, sidebar, sidebarItemArea, selectedNavItemTitle, menuNavLevelup, menuScrollUp, menuScrollDown
let cursor
let timeoutScroll
let navAreaStack = [];

// Exposes an HTML sanitizer to allow for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
window.addEventListener('DOMContentLoaded', () => {
	// Expose DOMPurify to the renderer process
	window.sanitizeHTML = (html) => {
		return DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
	};
});

ipcRenderer.on('mainWindowLoaded', () => {

	//Setup cursors
	setupCursor();
	//Setup browser functionality events 
	setupFunctionality();
	//Setup navigation sidebar
	setupNavigationSideBar();
})

ipcRenderer.on('ipc-mainwindow-handle-dwell-events', (event, isDwellingActive) => {
	// When dwelling is off, the sidebar is not populated with elements, but if there are still elements in the sidebar, they are removed. 
	// Therefore, resetNavigationSidebar() is called to clear the sidebar either from the previous elements, or from the dwelling message.
	resetNavigationSidebar();
	if (!isDwellingActive) showDwellingPausedMessage();
});

// =================================
// ==== Cursor management ====
// =================================

function setupCursor() {
	//Setup cursor on main window view
	createCursor('cactus_cursor');
	cursor = document.getElementById('cactus_cursor');
	followCursor('cactus_cursor');

	//Get reference to webContentsViewContainer
	navbar = byId('navbar')
	sidebar = byId('sidebar')

	navbar.addEventListener('mouseout', () => {
		cursor.style.visibility = 'hidden'
	})

	navbar.addEventListener('mouseover', () => {
		cursor.style.visibility = 'visible'
	})

	sidebar.addEventListener('mouseout', () => {
		cursor.style.visibility = 'hidden'
	})

	sidebar.addEventListener('mouseover', () => {
		cursor.style.visibility = 'visible'
	})
}


// =================================
// ==== Browser Functionality ======
// =================================

function setupFunctionality() {
	omni = byId('url')
	omni.addEventListener('keydown', (event) => browseToUrl(event));
	dwell(omni, () => {
		// hideAllOverlays()
		// showOverlay('omni');
		// showOverlay('keyboard', omni.type, "url");
		let elementProperties = {
			id: 'url',
			value: omni.value,
			type: omni.type,
		}
		showOverlay('keyboard', elementProperties);
	});

	let backOrForward = byId('backOrForwardBtn')
	dwell(backOrForward, () => {
		// invoke an ipc call to get the tabView.canGoBack() and tabView.canGoForward() and then show the overlay if either is true
		ipcRenderer.invoke('tabview-can-go-back-or-forward').then((hasNavigationHistory) => {
			if (!hasNavigationHistory) {
				backOrForward.classList.add('shake')

				backOrForward.addEventListener('webkitAnimationEnd', () => {
					backOrForward.classList.remove('shake')
				})

				overlayNav.style.display = 'none'
			} else {
				showOverlay('navigation')
			}
		});
	})

	let tabs = byId('tabsBtn')
	dwell(tabs, () => {
		showOverlay('tabs');
	})

	let accessibility = byId('accessibilityBtn')
	dwell(accessibility, () => {
		showOverlay('accessibility');
	})
}

ipcRenderer.on('ipc-mainwindow-keyboard-input', (event, input) => {
	omni = byId('url')
	omni.value = input;
	browseToUrl({ keyCode: 13 });
});

ipcRenderer.on('tabview-loading-start', () => {
	let loader = byId('loader');
	let favicon = byId('favicon');
	let omni = byId('url')

	favicon.style.display = "none";
	loader.style.display = "block";
	omni.value = 'Loading..';
});

function browseToUrl(event) {
	let omni = byId('url')
	if (event.keyCode === 13) {
		omni.blur();
		let val = omni.value;

		// Check if the URL contains a period
		if (val.includes('.')) {
			// Extract the part after the last period
			const domainPart = val.substring(val.lastIndexOf('.') + 1);

			// List of common domain extensions
			const validDomains = ['com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'html', 'io'];

			// Check if the extracted part is a valid domain extension
			if (!validDomains.includes(domainPart)) {
				// Treat as a search query
				val = `https://www.google.com/search?q=${encodeURIComponent(val)}`;
			}
		} else {
			val = `https://www.google.com/search?q=${encodeURIComponent(val)}`;
		}

		let https = val.slice(0, 8).toLowerCase();
		let http = val.slice(0, 7).toLowerCase();

		//NOTE: This prevents the browser from loading local files
		if (https === 'https://') {
			ipcRenderer.send('browse-to-url', val);
		} else if (http === 'http://') {
			ipcRenderer.send('browse-to-url', 'https://' + val);
		} else {
			ipcRenderer.send('browse-to-url', 'https://' + val);
		}

		// ipcRenderer.send('browse-to-url', val); // this has been added temporarily to test out different elements for loading the keyboard
	}
}

ipcRenderer.on('tabview-loading-stop', (event, pageDetails) => {
	let loader = byId('loader');
	let favicon = byId('favicon');
	let omni = byId('url')

	favicon.style.display = "block"
	loader.style.display = "none"
	omni.value = pageDetails.title;

	omni.addEventListener('click', () => displayOmni(pageDetails.url), { once: true });
	omni.addEventListener('blur', () => displayOmni(pageDetails.title), { once: true });
});

function displayOmni(value) {
	let omni = byId('url')
	omni.classList.add('fadeOutDown')
	setTimeout(() => {
		omni.classList.remove('fadeOutDown')
		omni.value = value;
		omni.classList.add('fadeInUp')
	}, 200);
}

ipcRenderer.on('ipc-mainwindow-load-omnibox', (event) => {
	omni = byId('url')
	let elementProperties = {
		id: 'url',
		value: omni.value,
		type: omni.type,
	}
	showOverlay('keyboard', elementProperties);
});

ipcRenderer.on('ipc-trigger-click-under-cursor', (event) => {
	const mouse = getMouse();
	const element = document.elementFromPoint(mouse.x, mouse.y);
	if (element) {
		element.click();
	}
});


// =================================
// == Sidebar element management ===
// =================================

function setupNavigationSideBar() {
	resetNavigationSidebar();

	menuNavLevelup = byId('sidebar_levelup')
	menuScrollUp = byId('sidebar_scrollup')
	menuScrollDown = byId('sidebar_scrolldown')
	sidebarItemArea = byId('sidebar_items')

	dwell(menuNavLevelup, () => {
		if (navAreaStack.length) {
			const previousLevel = navAreaStack.pop();
			selectedNavItemTitle.textContent = previousLevel.title;
			if (selectedNavItemTitle.textContent == "") selectedNavItemTitle.style.display = 'none';
			renderNavItemInSidebar(previousLevel.items);
		}
	});

	const scrollDistance = config.get('dwelling.menuAreaScrollDistance');
	const scrollInterval = config.get('dwelling.menuAreaScrollIntervalInMs');
	//Set up scrolling event
	menuScrollUp.onmouseover = () => {
		// Clear any existing interval to avoid multiple intervals running simultaneously
		clearInterval(timeoutScroll);

		// Start a new interval to execute the code every x ms
		timeoutScroll = setInterval(sidebarScrollUp(), scrollInterval);
	}

	function sidebarScrollUp() {
		sidebarItemArea.scrollBy({
			top: (scrollDistance * -1),
			left: 0,
			behavior: "smooth"
		});
	}

	menuScrollDown.onmouseover = () => {
		// Clear any existing interval to avoid multiple intervals running simultaneously
		clearInterval(timeoutScroll);

		// Start a new interval to execute the code every x ms
		timeoutScroll = setInterval(sidebarScrollDown(), scrollInterval);
	}

	function sidebarScrollDown() {
		sidebarItemArea.scrollBy({
			top: scrollDistance,
			left: 0,
			behavior: "smooth"
		});
	}

	//Clear timeouts
	menuScrollUp.onmouseout = () => {
		// Clear the interval when the mouse leaves the element
		clearInterval(timeoutScroll);
	}

	menuScrollDown.onmouseout = () => {
		// Clear the interval when the mouse leaves the element
		clearInterval(timeoutScroll);
	}

	ipcRenderer.on('ipc-main-sidebar-scrollup', () => {
		sidebarScrollUp();
	});

	ipcRenderer.on('ipc-main-sidebar-scrolldown', () => {
		sidebarScrollDown();
	});
}

ipcRenderer.on('ipc-mainwindow-sidebar-render-navareas', (event, navAreas) => {
	if (navAreas.length) {
		//Clear sidebar
		resetNavigationSidebar();

		//Render only one navArea at a time
		if (navAreas.length > 0) {
			if (navAreas[0].navItems) {
				renderNavItemInSidebar(navAreas[0].navItems[0]); //Root
			}
			//Highlight newly added elements on page
			ipcRenderer.send('ipc-mainwindow-highlight-elements-on-page', navAreas);
		}

	}
})

ipcRenderer.on('ipc-mainwindow-sidebar-render-elements', (event, elements) => {
	resetNavigationSidebar({ clearItems: false });

	sidebarItemArea = byId('sidebar_items');
	if (elements.length > 0) {
		let sidebarItems = document.querySelectorAll('.sidebar_item');
		const elementIDsToAdd = elements.map((e) => e.id);

		//Check if element to add already exists and remove it from list, not to add twice
		const existingInteractiveElementIDsOnSidebar = [];
		sidebarItems.forEach(element => {
			const elementId = element.getAttribute('id');
			existingInteractiveElementIDsOnSidebar.push(elementId);
		});

		//Remove elements from the list of elements to add - in reverse order, not to affect the iteration
		for (let i = elements.length - 1; i >= 0; i--) {
			if (existingInteractiveElementIDsOnSidebar.includes(elements[i].id)) {
				elements.splice(i, 1); // Remove element at index i
			}
		}

		//Remove out of scope elements from sidebar first
		sidebarItems.forEach(element => {
			const elementId = element.getAttribute('id');
			if (!elementIDsToAdd.includes(elementId)) {
				element.remove();
			}
		});
		
		elements.forEach(e => {
			const sidebarItem = createSidebarItemElement(e, false);
			sidebarItemArea.appendChild(sidebarItem);
		});

		//Highlight newly added elements on page
		ipcRenderer.send('ipc-mainwindow-highlight-elements-on-page', elements);

		//Attach dwell
		sidebarItems = document.querySelectorAll('.sidebar_item')
		sidebarItems.forEach(item => {
			dwell(item, () => {
				const elementId = item.getAttribute('id');
				const elementToClick = elements.filter(e => e.id == elementId);
				if (elementToClick) {
					// Show click event animation and clear sidebar
					item.classList.add('fadeOutDown');
					console.log("element to click: ", elementToClick);

					setTimeout(() => {
						const inputType = shouldDisplayKeyboard(elementToClick[0], false);
						console.log("inputType", inputType);
						if (inputType) {
							elementToClick[0].type = inputType;
							elementToClick[0].value = elementToClick[0].value ? elementToClick[0].value : ""; // DOESN'T WORK // This prevents the value from being undefined
							console.log("Identified an input element: ", elementToClick[0]);
							console.log("It has the value of: ", elementToClick[0].value);
							showOverlay('keyboard', elementToClick[0]);
						} else if (elementToClick[0]) {
							console.log("Not an input element");
							ipcRenderer.send('ipc-mainwindow-click-sidebar-element', elementToClick[0]);
						}
					}, 300);
				}
			});
		});
	}
	else {
		sidebarItemArea.innerHTML = "";
	}
});

//Accepts an array of NavItems [x] => [...NavItem]
function renderNavItemInSidebar(navItems) {
	//Clear sidebar
	sidebarItemArea = byId('sidebar_items');
	sidebarItemArea.innerHTML = "";

	// Add elements to sidebar
    if (Array.isArray(navItems)) {
        navItems.forEach(navItem => {
            const sidebarItem = createSidebarItemElement(navItem, true);
            sidebarItemArea.appendChild(sidebarItem);
        });
    } else {
        const sidebarItem = createSidebarItemElement(navItems, true);
        sidebarItemArea.appendChild(sidebarItem);
    }

	//Scroll to top (in case already mid-way)
	sidebarItemArea.scrollTo(0, 0);

	//Attach dwell
	let sidebarItems = document.querySelectorAll('.sidebar_item')
	sidebarItems.forEach(item => {
		dwell(item, () => {
			const elementId = item.getAttribute('id');
			const elementToClick = Array.isArray(navItems) ? navItems.filter(e => e.id == elementId) : [navItems];
			if (elementToClick) {
				if (!elementToClick[0].children || elementToClick[0].children.length == 0) {
					// Show click event animation and clear sidebar
					item.classList.add('fadeOutDown');
					setTimeout(() => {
						sidebarItemArea.innerHTML = "";
						const inputType = shouldDisplayKeyboard(elementToClick[0], true);

						if (inputType) {
							elementToClick[0].type = inputType;
							elementToClick[0].value = elementToClick[0].value ? elementToClick[0].value : ""; // This prevents the value from being undefined
							console.log("Identified input navitem: ", elementToClick[0]);
							showOverlay('keyboard', elementToClick[0]);
						} else {
							console.log("Not an input navitem");
							ipcRenderer.send('browse-to-url', elementToClick[0].href);
						}
					}, 300);

					resetNavigationSidebar();
				} else {
					//Set current level in stack
					navAreaStack.push({
						title: selectedNavItemTitle.textContent,
						items: navItems
					});

					// Update the title to the clicked nav item
					selectedNavItemTitle = byId('sidebar_selected-navitem-title');
					selectedNavItemTitle.style.display = 'block';
					selectedNavItemTitle.textContent = elementToClick[0].label;

					//Go down one level
					renderNavItemInSidebar(elementToClick[0].children);
				}
			}
		}, false)
	});
	// });

	//Set up hierarchical navigation controls in sidebar
	menuNavLevelup = byId('sidebar_levelup')
	if (navAreaStack.length > 0)
		menuNavLevelup.style.display = 'flex';
	else
		menuNavLevelup.style.display = 'none'
}

// Resets the navigation sidebar to its initial state
function resetNavigationSidebar(options = {}) {
	const { clearItems = true } = options;

	if (clearItems) {
		//Clear sidebar items
		sidebarItemArea = byId('sidebar_items');
		sidebarItemArea.innerHTML = "";
	}

	//Clear the selection history from stack
	navAreaStack = [];

	//Hide nav level up button
	menuNavLevelup = byId('sidebar_levelup')
	menuNavLevelup.style.display = 'none'

	//Clear the submenu showing the selection history
	selectedNavItemTitle = byId('sidebar_selected-navitem-title');
	selectedNavItemTitle.textContent = ""
	selectedNavItemTitle.style.display = 'none'
}

function createSidebarItemElement(element, isNavItem) {
	const sidebarItem = document.createElement('div');
	sidebarItem.className = 'sidebar_item fadeInDown';
	sidebarItem.id = element.id;

	const itemContent = document.createElement('div');

	const itemTitle = document.createElement('div');
	itemTitle.className = 'sidebar_item_title';
	itemTitle.textContent = isNavItem ? element.label : element.accessibleName;

	const itemLink = document.createElement('div');
	itemLink.className = 'sidebar_item_link';
	itemLink.textContent = isNavItem ? element.isLeaf : element.type;

	itemContent.appendChild(itemTitle);
	itemContent.appendChild(itemLink);

	const itemIcon = document.createElement('div');
	itemIcon.className = 'sidebar_item_icon';
	let iconHTML;

	if (isNavItem) {
		iconHTML = element.children.length > 0 ? createMaterialIcon('menu') : createMaterialIcon('chevron_right');
	} else {
		switch (element.type) {
			case 'a':
				iconHTML = createMaterialIcon('link'); break;
			case 'button':
			case 'submit':
				iconHTML = createMaterialIcon('left_click'); break;
			case 'textarea':
			case 'text':
				iconHTML = createMaterialIcon('text_fields'); break;
			case 'password':
				iconHTML = createMaterialIcon('password'); break;
			case 'checkbox':
				iconHTML = createMaterialIcon('check_box'); break;
			case 'radio':
				iconHTML = createMaterialIcon('radio_button_checked'); break;
			case 'option':
				iconHTML = createMaterialIcon('list'); break;
			case 'date':
				iconHTML = createMaterialIcon('calendar_month'); break;
			case 'select':
				iconHTML = createMaterialIcon('arrow_drop_down'); break;
			default:
				iconHTML = element.children ? createMaterialIcon('menu') : createMaterialIcon('chevron_right'); break;
		}
	}

	itemIcon.innerHTML = iconHTML;

	sidebarItem.appendChild(itemContent);
	sidebarItem.appendChild(itemIcon);

	return sidebarItem;
}

// Function to create Material Icons
function createMaterialIcon(icon_name) {
	return `<i class="material-icons--smaller">${icon_name}</i>`;
}

function showDwellingPausedMessage() {
	sidebarItemArea = byId('sidebar_items');

	const messageDiv = document.createElement('div');
	messageDiv.textContent = "Dwelling Paused";
	messageDiv.id = "sidebar_dwelling-message";

	sidebarItemArea.appendChild(messageDiv);
}


// =================================
// ============ Overlays ===========
// =================================

// Determines if a keyboard should be displayed based on the element type and returns the element type if a keyboard is required, otherwise false.
function shouldDisplayKeyboard(element, isNavItem = false) {
	console.log("should display keyboard function called with element: ", element);
	if (element) {
		const KEYBOARD_REQUIRED_ELEMENTS = [
			'textarea', 'text', 'search', 'password', 'email', 'number', 'tel', 'url', 'date', 'datetime-local', 'month', 'time', 'week'
		];
		let type = isNavItem ? element.tag.toLowerCase() : element.type.toLowerCase();

		return KEYBOARD_REQUIRED_ELEMENTS.indexOf(type) !== -1 ? type : false;
	}
	return false;
}

function showOverlay(overlayAreaToShow, elementProperties = null) {
	ipcRenderer.send('ipc-mainwindow-show-overlay', overlayAreaToShow, elementProperties);
}