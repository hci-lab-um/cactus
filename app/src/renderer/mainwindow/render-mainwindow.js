const fs = require('original-fs')
const path = require('path')
const { ipcRenderer } = require('electron')
const { byId, dwell, detachAllDwellListeners, dwellInfinite } = require('../../tools/utils')
const { createCursor, followCursor, getMouse } = require('../../tools/cursor')
const DOMPurify = require('dompurify');

let omni, navbar, sidebar, sidebarItemArea, selectedNavItemTitle, menuNavLevelup, menuScrollUp, menuScrollDown;
let cursor;
let navAreaStack = [];
let url;
let isDwellingActive;
let scrollDistance;
let scrollIntervalInMs;

// Exposes an HTML sanitizer to allow for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
window.addEventListener('DOMContentLoaded', () => {
	try {
		// Expose DOMPurify to the renderer process
		window.sanitizeHTML = (html) => {
			return DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
		};
	} catch (error) {
		console.error("Error during DOMContentLoaded:", error);
	}
});

ipcRenderer.on('mainWindowLoaded', (event, dwellTime, menuAreaScrollDistance, menuAreaScrollIntervalInMs, isDwelling) => {
	try {
		isDwellingActive = isDwelling;
		scrollDistance = menuAreaScrollDistance;
		scrollIntervalInMs = menuAreaScrollIntervalInMs;
		// Setting the dwell time in CSS variable
		document.documentElement.style.setProperty('--dwell-time', `${dwellTime}ms`);

		//Setup cursors
		setupCursor();
		//Setup browser functionality events 
		setupFunctionality();
		//Setup navigation sidebar
		setupNavigationSideBar();
	} catch (error) {
		console.error("Error in mainWindowLoaded handler:", error);
	}
});

ipcRenderer.on('ipc-mainwindow-handle-dwell-events', (event, isDwelling) => {
	try {
		// When dwelling is off, the sidebar is not populated with elements, but if there are still elements in the sidebar, they are removed. 
		// Therefore, resetNavigationSidebar() is called to clear the sidebar either from the previous elements, or from the dwelling message.
		isDwellingActive = isDwelling;
		resetNavigationSidebar();
		if (!isDwellingActive) showDwellingPausedMessage();
	} catch (error) {
		console.error("Error in ipc-mainwindow-handle-dwell-events handler:", error);
	}
});

ipcRenderer.on('ipc-mainwindow-update-dwell-time', async (event, newDwellTime) => {
	try {
		// Update the CSS variable for dwell time in the main window
		const root = document.documentElement;
		root.style.setProperty('--dwell-time', `${newDwellTime}ms`);

		// Removing and reattaching dwell listeners to all elements in the mainwindow
		detachAllDwellListeners();
		setupFunctionality(true);
		setupNavigationSideBar(true);
	} catch (error) {
		console.error("Error in ipc-mainwindow-update-dwell-time handler:", error);
	}
});

ipcRenderer.on('ipc-mainwindow-update-scroll-distance', (event, newScrollDistance) => {
	try {
		scrollDistance = newScrollDistance;
		detachAllDwellListeners();
		setupFunctionality(true);
		setupNavigationSideBar(true);
	} catch (error) {
		console.error("Error in ipc-mainwindow-update-scroll-distance handler:", error);
	}
});

// =================================
// ==== Cursor management ====
// =================================

function setupCursor() {
	try {
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
	} catch (error) {
		console.error("Error in setupCursor:", error);
	}
}


// =================================
// ==== Browser Functionality ======
// =================================

async function setupFunctionality(reattachListeners = false) {
	try {
		let roundedBookmark = '<svg xmlns="http://www.w3.org/2000/svg" height="2.1rem" viewBox="0 -960 960 960" width="2.1rem"><path d="M333.33-259 480-347l146.67 89-39-166.67 129-112-170-15L480-709l-66.67 156.33-170 15 129 112.34-39 166.33ZM480-269 300.67-161q-9 5.67-19 5-10-.67-17.67-6.33-7.67-5.67-11.67-14.5-4-8.84-1.66-19.84L298-401 139.67-538.67q-8.67-7.66-10.5-17.16-1.84-9.5.83-18.5t10-15q7.33-6 18.67-7.34L368-615l81-192.67q4.33-10 13.17-15 8.83-5 17.83-5 9 0 17.83 5 8.84 5 13.17 15L592-615l209.33 18.33q11.34 1.34 18.67 7.34 7.33 6 10 15t.83 18.5q-1.83 9.5-10.5 17.16L662-401l47.33 204.33q2.34 11-1.66 19.84-4 8.83-11.67 14.5-7.67 5.66-17.67 6.33-10 .67-19-5L480-269Zm0-204.33Z"/></svg>';
		let roundedBookmarkFilled = '<svg xmlns="http://www.w3.org/2000/svg" height="2.1rem" viewBox="0 -960 960 960" width="2.1rem"><path d="M480-269 294-157q-8 5-17 4.5t-16-5.5q-7-5-10.5-13t-1.5-18l49-212-164-143q-8-7-9.5-15.5t.5-16.5q2-8 9-13.5t17-6.5l217-19 84-200q4-9 12-13.5t16-4.5q8 0 16 4.5t12 13.5l84 200 217 19q10 1 17 6.5t9 13.5q2 8 .5 16.5T826-544L662-401l49 212q2 10-1.5 18T699-158q-7 5-16 5.5t-17-4.5L480-269Z"/></svg>';

		omni = byId('omnibox')
		let backOrForward = byId('backOrForwardBtn')
		let bookmarkBtn = byId('bookmarkBtn')
		let bookmarks = byId('bookmarksBtn')
		let tabs = byId('tabsBtn')
		let accessibility = byId('accessibilityBtn')

		if (!reattachListeners) {
			omni.addEventListener('keydown', (event) => processUrlInput(event, omni.value));

			ipcRenderer.on('ipc-main-update-bookmark-icon', (event, isBookmark) => {
				if (isBookmark) {
					bookmarkBtn.innerHTML = roundedBookmarkFilled;
					bookmarkBtn.classList.add('bookmarked');
				} else {
					bookmarkBtn.innerHTML = roundedBookmark;
					bookmarkBtn.classList.remove('bookmarked');
				}
			});
		}

		dwell(omni, () => {
			let elementProperties = {
				id: 'url',
				value: omni.value,
				type: omni.type,
			}
			showOverlay('keyboard', elementProperties);
		});

		dwell(backOrForward, () => {
			// invoke an ipc call to get the tabView.canGoBack() and tabView.canGoForward() and then show the overlay if either is true
			ipcRenderer.invoke('tabview-can-go-back-or-forward').then((hasNavigationHistory) => {
				if (!hasNavigationHistory) {
					backOrForward.classList.add('shake')

					backOrForward.addEventListener('webkitAnimationEnd', () => {
						backOrForward.classList.remove('shake')
					})
				} else {
					showOverlay('navigation')
				}
			});
		})

		dwell(bookmarkBtn, () => {
			if (bookmarkBtn.classList.contains('bookmarked')) {
				ipcRenderer.send('ipc-mainwindow-remove-bookmark');
				bookmarkBtn.innerHTML = roundedBookmark;
				bookmarkBtn.classList.remove('bookmarked');
			} else {
				ipcRenderer.send('ipc-mainwindow-add-bookmark');
				bookmarkBtn.innerHTML = roundedBookmarkFilled;
				bookmarkBtn.classList.add('bookmarked');
			}
		})

		dwell(bookmarks, () => {
			showOverlay('bookmarks');
		})

		dwell(tabs, () => {
			showOverlay('tabs');
		})

		dwell(accessibility, () => {
			showOverlay('accessibility');
		})
	} catch (error) {
		console.error("Error in setupFunctionality:", error);
	}
}

ipcRenderer.on('ipc-mainwindow-keyboard-input', (event, input) => {
	try {
		omni = byId('url')
		processUrlInput({ keyCode: 13 }, input);
	} catch (error) {
		console.error("Error in ipc-mainwindow-keyboard-input handler:", error);
	}
});

async function fetchValidTLDs() {
	try {
		const tldFilePath = path.join(__dirname, '../../../resources/validTLDs.json');

		// Checking if TLDs are already stored in a file
		if (fs.existsSync(tldFilePath)) {
			const storedTLDs = fs.readFileSync(tldFilePath, 'utf-8');
			console.log("Loaded TLDs from file");
			return new Set(JSON.parse(storedTLDs));
		}
		return new Set();
	} catch (error) {
		console.error("Failed to fetch TLD list:", error);
		return new Set();
	}
}

async function isValidTLD(domain, validTLDs) {
	try {
		const domainParts = domain.split(".");
		const tld = domainParts[domainParts.length - 1].toLowerCase();
		return validTLDs.has(tld);
	} catch (error) {
		console.error("Error in isValidTLD:", error);
		return false;
	}
}

// Helper function to check if input is a valid URL
function isValidUrl(string) {
	try {
		new URL(string);
		return true;
	} catch (error) {
		console.error("Error in isValidUrl:", error);
		return false;
	}
}

// Checking for IPv4 and IPv6 and other local names
function isLocalOrIP(hostname) {
	try {
		const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
		const ipv6Regex = /^\[[a-fA-F0-9:]+\]$/;
		const LOCALHOST = "localhost";

		return ipv4Regex.test(hostname) || ipv6Regex.test(hostname) || hostname.toLowerCase() === LOCALHOST;
	} catch (error) {
		console.error("Error in isLocalOrIP:", error);
		return false;
	}
}

async function processUrlInput(event, input) {
	try {
		if (event.keyCode === 13) {
			const VALID_TLDs = await fetchValidTLDs();
			const URL_REGEX = /^(?:(?:https?:\/\/)?((?:[\w-]+\.)+[a-zA-Z]{2,})(?::\d+)?(?:[\w.,@?^=%&:/~+#-]*)?)$/
			const FILE_PATH_REGEX = /^(?:[a-zA-Z]:\\(?:[^\\\/:*?"<>|\r\n]+\\)*[^\\\/:*?"<>|\r\n]*|\/(?:[^\\\/:*?"<>|\r\n]+\/)*[^\\\/:*?"<>|\r\n]*)$/;
			let url = '';	

			// If input does NOT start with http/https but looks like a valid domain, prepend "https://"
			if (!input.startsWith("http") && (URL_REGEX.test(input) || isLocalOrIP(input))) {
				input = `https://${input}`;
			}

			if (isValidUrl(input)) {
				let urlObject = new URL(input);
				let pathname = urlObject.pathname;
				
				if (urlObject.protocol === "http:") {
					urlObject.protocol = "https:";
				}

				if (urlObject.protocol === "file:" && pathname.startsWith("/")) {
					pathname = pathname.substring(1); // removing the first forward slash
				}
				
				// The new URL(input) does not validate the URL strictly, — it just attempts to parse it, hence regex is used to validate the URL more strictly
				// Note: FILE_PATH_REGEX.test(input.replace(/\//g, '\\')) is used to recheck the input with forward slashes replaced with backslashes
				if (URL_REGEX.test(urlObject.hostname) || FILE_PATH_REGEX.test(pathname) || FILE_PATH_REGEX.test(pathname.replace(/\//g, '\\')) || isLocalOrIP(urlObject.hostname)) {
					url = urlObject.toString();
				} else {
					url = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
				}

				// If the url has a TLD, check if it is found in the list of valid TLDs
				if (!isLocalOrIP(urlObject.hostname)) {
					// If TLD is invalid, treat it as a search query
					if (!(await isValidTLD(urlObject.hostname, VALID_TLDs))) {
						console.warn(`Invalid TLD detected: ${urlObject.hostname}`);
						url = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
					}
				}
			} else {				
				// Otherwise, treat it as a search query
				url = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
			}

			console.log('url', url);
			ipcRenderer.send('browse-to-url', url);
		}
	} catch (error) {
		console.error("Error in browseToUrl:", error);
	}
}

ipcRenderer.on('tabview-loading-start', () => {
	try {
		let loader = byId('loader');
		let favicon = byId('favicon');
		let omni = byId('url')

		favicon.style.color = '#03644f'; // green
		favicon.style.display = "none";
		loader.style.display = "block";
		omni.value = 'Loading..';
	} catch (error) {
		console.error("Error in tabview-loading-start handler:", error);
	}
});

ipcRenderer.on('tabview-loading-stop', (event, pageDetails) => {
	try {
		let loader = byId('loader');
		let favicon = byId('favicon');
		let omni = byId('url')

		if (pageDetails.isErrorPage || !pageDetails.successfulLoad) {
			favicon.getElementsByTagName('i')[0].innerText = 'close'; 
			favicon.style.color = '#ba1539' // dark red
		} else {
			favicon.getElementsByTagName('i')[0].innerText = 'check';
			favicon.style.color = '#03644f' // green
		}

		favicon.style.display = "block";
		loader.style.display = "none";
		omni.value = pageDetails.title;

		omni.addEventListener('click', () => displayOmni(pageDetails.url), { once: true });
		omni.addEventListener('blur', () => displayOmni(pageDetails.title), { once: true });
	} catch (error) {
		console.error("Error in tabview-loading-stop handler:", error);
	}
});

function displayOmni(value) {
	try {
		let omni = byId('url')
		omni.classList.add('fadeOutDown')
		setTimeout(() => {
			omni.classList.remove('fadeOutDown')
			omni.value = value;
			omni.classList.add('fadeInUp')
		}, 200);
	} catch (error) {
		console.error("Error in displayOmni:", error);
	}
}

ipcRenderer.on('ipc-mainwindow-load-omnibox', (event) => {
	try {
		omni = byId('url')
		let elementProperties = {
			id: 'url',
			value: omni.value,
			type: omni.type,
		}
		showOverlay('keyboard', elementProperties);
	} catch (error) {
		console.error("Error in ipc-mainwindow-load-omnibox handler:", error);
	}
});

ipcRenderer.on('ipc-trigger-click-under-cursor', (event) => {
	try {
		const mouse = getMouse();
		const element = document.elementFromPoint(mouse.x, mouse.y);
		if (element) {
			element.click();
		}
	} catch (error) {
		console.error("Error in ipc-trigger-click-under-cursor handler:", error);
	}
});


// =================================
// == Sidebar element management ===
// =================================

function setupNavigationSideBar(reattachListeners = false) {
	try {
		if (!reattachListeners) resetNavigationSidebar();

		quickClick = byId('sidebar_quick')
		menuNavLevelup = byId('sidebar_levelup')
		menuScrollUp = byId('sidebar_scrollup')
		menuScrollDown = byId('sidebar_scrolldown')
		sidebarItemArea = byId('sidebar_items')
		
		function sidebarScroll(direction) {
			sidebarItemArea.scrollBy({
				top: scrollDistance * direction,
				behavior: "smooth"
			});
		}

		ipcRenderer.on('ipc-main-sidebar-scrollup', () => {
			sidebarScroll(-1);
		});

		ipcRenderer.on('ipc-main-sidebar-scrolldown', () => {
			sidebarScroll(1);
		});

		dwell(quickClick, () => {
			showOverlay('quickClick');
		});

		dwell(menuNavLevelup, () => {
			if (navAreaStack.length) {
				const previousLevel = navAreaStack.pop();
				selectedNavItemTitle.textContent = previousLevel.title;
				if (selectedNavItemTitle.textContent == "") selectedNavItemTitle.style.display = 'none';
				if (!previousLevel.isNavItem) renderElementsInSidebar(previousLevel.items, sidebarItemArea, previousLevel.isSubOption);
				else renderNavItemInSidebar(previousLevel.items);
			}
		});

		// Scroll functionality
		dwellInfinite(menuScrollUp, () => sidebarScroll(-1), false, scrollIntervalInMs);
		dwellInfinite(menuScrollDown, () => sidebarScroll(1), false, scrollIntervalInMs);
	} catch (error) {
		console.error("Error in setupNavigationSideBar:", error);
	}
}

ipcRenderer.on('ipc-mainwindow-clear-sidebar', () => {
	try {
		resetNavigationSidebar();
	} catch (error) {
		console.error("Error in ipc-mainwindow-clear-sidebar handler:", error);
	}
});

ipcRenderer.on('ipc-mainwindow-sidebar-render-navareas', (event, navAreas, tabURL) => {
	try {
		url = tabURL;
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
	} catch (error) {
		console.error("Error in ipc-mainwindow-sidebar-render-navareas handler:", error);
	}
})

ipcRenderer.on('ipc-mainwindow-sidebar-render-elements', (event, elements, tabURL) => {
	try {
		// 'elements' refers to the unique interactive element objects on the page

		url = tabURL;
		resetNavigationSidebar({ clearItems: false });

		sidebarItemArea = byId('sidebar_items');
		if (elements.length > 0) {
			renderElementsInSidebar(elements, sidebarItemArea);
		}
		else {
			sidebarItemArea.innerHTML = "";
		}
	} catch (error) {
		console.error("Error in ipc-mainwindow-sidebar-render-elements handler:", error);
	}
});

//Accepts an array of NavItems [x] => [...NavItem]
function renderNavItemInSidebar(navItems) {
	try {
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
							} else if (elementToClick[0].href) {
								// href attribute is a truthy value, therefore we navigate to the URL
								ipcRenderer.send('browse-to-url', elementToClick[0].href);
							} else {
								// href is not valid, hence we click on the element instead
								ipcRenderer.send('ipc-mainwindow-click-sidebar-element', elementToClick[0]);
							}
						}, 400); // 400 is chosen to match the fadeOutDown animation duration

						resetNavigationSidebar();
					} else {
						//Setting the current level in stack and updating the title to the clicked nav item
						handleSidebarStack(selectedNavItemTitle.textContent, navItems, true, false, elementToClick[0].label);				

						//Go down one level
						renderNavItemInSidebar(elementToClick[0].children);
					}
				}
			}, false)
		});

		setMenuLevelUpButtonVisibility();
	} catch (error) {
		console.error("Error in renderNavItemInSidebar:", error);
	}
}

function renderElementsInSidebar(elements, sidebarItemArea, isSubOption = false) {
	try {
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
			const sidebarItem = createSidebarItemElement(e, false, isSubOption);
			sidebarItemArea.appendChild(sidebarItem);
		});

		//Highlight newly added elements on page
		ipcRenderer.send('ipc-mainwindow-highlight-elements-on-page', elements);

		//Attach dwell
		sidebarItems = document.querySelectorAll('.sidebar_item')
		sidebarItems.forEach(item => {
			dwell(item, () => {
				const elementId = item.getAttribute('id');
				const elementToClick = isSubOption ? elements.filter(e => e.value == elementId) : elements.filter(e => e.id == elementId);

				if (elementToClick[0]) {
					// Show click event animation
					item.classList.add('fadeOutDown');
					console.log("element to click: ", elementToClick);

					setTimeout(() => {
						// After 400ms, clear the sidebar and perform the necessary action
						sidebarItemArea.innerHTML = "";

						if (isSubOption) {
							if (elementToClick[0].value !== 'volume' && elementToClick[0].value !== 'seek') {
								console.log("Identified a dropdown option: ", elementToClick[0]);
								resetNavigationSidebar();

								// Set the value of the dropdown to the value of the option
								ipcRenderer.send('ipc-mainwindow-set-element-value', elementToClick[0]);
							} else {
								let navTitle = elementToClick[0].value.charAt(0).toUpperCase() + elementToClick[0].value.slice(1);
								handleSidebarStack("Video", elements, false, true, navTitle);
								renderElementsInSidebar(elementToClick[0].rangeValues, sidebarItemArea, true);
							}
						} else {
							const elementType = getElementType(elementToClick[0], false);
							const inputType = shouldDisplayKeyboard(elementType);
							console.log("element type: ", elementType);
							console.log("input type: ", inputType);

							if (inputType) {
								elementToClick[0].type = inputType;
								showOverlay('keyboard', elementToClick[0]);
							} else if (elementType === 'iframe') {
								console.log("Identified an iframe element: ", elementToClick[0]);
								ipcRenderer.send('ipc-mainwindow-open-iframe', elementToClick[0].src);
							} else if (elementType === 'select') {
								console.log("Identified a select element: ", elementToClick[0]);
								const dropdownOptions = elementToClick[0].options;
								handleSidebarStack("", elements, false, false, elementToClick[0].accessibleName);
								renderElementsInSidebar(dropdownOptions, sidebarItemArea, true);
							} else if (elementType === 'range') {
								// Display all the range values in the sidebar
								console.log("Identified a range element: ", elementToClick[0]);
								handleSidebarStack("", elements, false, false, elementToClick[0].accessibleName);
								renderElementsInSidebar(elementToClick[0].rangeValues, sidebarItemArea, true);
							} else if (elementType === 'video') {
								console.log("Identified a video element: ", elementToClick[0]);
								handleSidebarStack("", elements, false, false, elementToClick[0].accessibleName);
								renderElementsInSidebar(elementToClick[0].videoOptions, sidebarItemArea, true);

								// Show the level up button when a video element is clicked
								setMenuLevelUpButtonVisibility();
							} else {
								console.log("Not an input element");
								ipcRenderer.send('ipc-mainwindow-click-sidebar-element', elementToClick[0]);
							}
							// hiding the cursor in the sidebar on robot click
							cursor.style.visibility = 'hidden';
						}
					}, 400); // 400 is chosen to match the fadeOutDown animation duration
				}
			});
		});

		setMenuLevelUpButtonVisibility();
	} catch (error) {
		console.error("Error in renderElementsInSidebar:", error);
	}
}

// Resets the navigation sidebar to its initial state
function resetNavigationSidebar(options = {}) {
	try {
		const { clearItems = true } = options;

		if (clearItems) {
			//Clear sidebar items
			sidebarItemArea = byId('sidebar_items');
			sidebarItemArea.innerHTML = "";
		}

		//Clear the selection history from stack
		navAreaStack = [];

		//Hide nav level up button
		setMenuLevelUpButtonVisibility();

		//Clear the submenu showing the selection history
		selectedNavItemTitle = byId('sidebar_selected-navitem-title');
		selectedNavItemTitle.textContent = ""
		selectedNavItemTitle.style.display = 'none'
		
		if (!isDwellingActive) showDwellingPausedMessage();
	} catch (error) {
		console.error("Error in resetNavigationSidebar:", error);
	}
}

function setMenuLevelUpButtonVisibility() {
	try {
		//Set up hierarchical navigation controls in sidebar
		menuNavLevelup = byId('sidebar_levelup')
		if (navAreaStack.length > 0)
			menuNavLevelup.style.display = 'flex';
		else
			menuNavLevelup.style.display = 'none'
	} catch (error) {
		console.error("Error in setMenuLevelUpButtonVisibility:", error);
	}
}

function handleSidebarStack(title = "", items = {}, isNavItem = false, isSubOption = false, navTitle) {
	try {
		navAreaStack.push({ title, items, isNavItem, isSubOption });

		// Update the title to the clicked nav item
		selectedNavItemTitle = byId('sidebar_selected-navitem-title');
		selectedNavItemTitle.style.display = 'block';
		selectedNavItemTitle.textContent = navTitle;
	} catch (error) {
		console.error("Error in handleSidebarStack:", error);
	}
}

function createSidebarItemElement(element, isNavItem, isSubOption = false) {
	try {
		const sidebarItem = document.createElement('div');
		sidebarItem.className = 'sidebar_item fadeInDown';
		sidebarItem.id = isSubOption ? element.value : element.id;

		const itemContent = document.createElement('div');

		const itemTitle = document.createElement('div');
		itemTitle.className = 'sidebar_item_title';
		itemTitle.textContent = isNavItem ? element.label : (element.accessibleName ? element.accessibleName : element.textContent);

		const itemLink = document.createElement('div');
		itemLink.className = 'sidebar_item_link';
		if (isNavItem) {
			itemLink.textContent = element.isLeaf && element.href ? getFullURL(element.href) : "";
		} else {
			itemLink.textContent = element.href ? getFullURL(element.href) : "";
		}

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
				case 'datetime-local':
				case 'month':
				case 'week':
					iconHTML = createMaterialIcon('calendar_month'); break;
				case 'time':
					iconHTML = createMaterialIcon('schedule'); break;
				case 'select':
				case 'range':
					iconHTML = createMaterialIcon('stat_minus_1'); break;
				case 'iframe':
					iconHTML = createMaterialIcon('open_in_new'); break;
				case 'video':
					iconHTML = createMaterialIcon('live_tv'); break;
				case 'pausePlay':
					iconHTML = createMaterialIcon('play_pause'); break;
				case 'muteUnmute':
					iconHTML = createMaterialIcon('volume_off'); break;
				default:
					iconHTML = element.children ? createMaterialIcon('menu') : createMaterialIcon('chevron_right'); break;
			}
		}

		itemIcon.innerHTML = iconHTML;

		sidebarItem.appendChild(itemContent);
		sidebarItem.appendChild(itemIcon);

		return sidebarItem;
	} catch (error) {
		console.error("Error in createSidebarItemElement:", error);
	}
}

function getFullURL(href) {
	try {
		let fullUrl = "";

		if (href) {
			//Assume all is ok
			fullUrl = href;
			const currentURL = new URL(url);
			const protocol = currentURL.protocol;

			//Handle URLs without protocol (e.g. //www.google.com)
			if (href.startsWith('//')) {
				fullUrl = protocol + href;
			} else if (href.startsWith('/') || href.startsWith('../') || href.startsWith('./')) {
				//Handle relative path URLs (e.g. /path/to/resource)
				fullUrl = new URL(href, currentURL).href;
			} else if (href.startsWith('#')) {
				//Handle anchors (e.g. #element-id)
				let currentAnchorPos = currentURL.href.indexOf('#');
				if (currentAnchorPos > 0) {
					fullUrl = currentURL.href.substring(0, currentAnchorPos) + href;
				} else {
					fullUrl = currentURL.href + href;
				}
			}
			else {
				//Take as is
				fullUrl = href;
			}
		}

		return fullUrl;
	} catch (error) {
		console.error("Error in getFullURL:", error);
		return href;
	}
}

// Function to create Material Icons
function createMaterialIcon(icon_name) {
	try {
		return `<i class="material-icons--smaller">${icon_name}</i>`;
	} catch (error) {
		console.error("Error in createMaterialIcon:", error);
		return "";
	}
}

function showDwellingPausedMessage() {
	try {
		sidebarItemArea = byId('sidebar_items');

		const messageDiv = document.createElement('div');
		messageDiv.textContent = "Dwelling Paused";
		messageDiv.id = "sidebar_dwelling-message";

		sidebarItemArea.appendChild(messageDiv);
	} catch (error) {
		console.error("Error in showDwellingPausedMessage:", error);
	}
}


// =================================
// ============ Overlays ===========
// =================================

function getElementType(element, isNavItem = false) {
	try {
		if (element) {
			return isNavItem ? element.tag.toLowerCase() : element.type.toLowerCase();
		}
		return false;
	} catch (error) {
		console.error("Error in getElementType:", error);
		return false;
	}
}

// Determines if a keyboard should be displayed based on the element type and returns the element type if a keyboard is required, otherwise false.
function shouldDisplayKeyboard(elementType) {
	try {
		if (elementType) {
			const KEYBOARD_REQUIRED_ELEMENTS = [
				'textarea', 'text', 'search', 'password', 'email', 'number', 'tel', 'url', 'date', 'datetime-local', 'month', 'time', 'week'
			];
			return KEYBOARD_REQUIRED_ELEMENTS.indexOf(elementType) !== -1 ? elementType : false;
		}
		return false;
	} catch (error) {
		console.error("Error in shouldDisplayKeyboard:", error);
		return false;
	}
}

function showOverlay(overlayAreaToShow, elementProperties = null) {
	try {
		ipcRenderer.send('ipc-mainwindow-show-overlay', overlayAreaToShow, elementProperties);
	} catch (error) {
		console.error("Error in showOverlay:", error);
	}
}