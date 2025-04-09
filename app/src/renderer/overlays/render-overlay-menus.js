const { ipcRenderer } = require('electron')
const { byId, dwell, dwellInfinite } = require('../../../src/tools/utils')
const { createCursor, followCursor, startCursorAnimation, stopCursorAnimation, getMouse } = require('../../../src/tools/cursor')
const DOMPurify = require('dompurify');

// Exposes an HTML sanitizer to allow for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
window.addEventListener('DOMContentLoaded', () => {
	// Expose DOMPurify to the renderer process
	window.sanitizeHTML = (html) => {
		return DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
	};

	//Init cursor
	createCursor('cactus_cursor');
	followCursor('cactus_cursor');
});

ipcRenderer.on('ipc-main-overlays-loaded', (event, overlaysData) => {
	const { overlayAreaToShow, tabList, bookmarks, settings, canGoBack, canGoForward, isDwellingActive, useNavAreas, useRobotJS, dwellTime, precisionDwellRange } = overlaysData;
	console.log('Overlays data', overlaysData);
	
	// Setting the dwell time in CSS variable
	document.documentElement.style.setProperty('--dwell-time', `${dwellTime}ms`);

	switch (overlayAreaToShow) {
		case 'omni': {
			byId('overlay-omnibox').style.display = 'grid'
			setEventHandlersForOmniMenu()
			break;
		}
		case 'navigation': {
			byId('overlay-nav').style.display = 'grid'
			setEventHandlersForNavigationMenu(canGoBack, canGoForward);
			break;
		}
		case 'tabs': {
			byId('overlay-tabs').style.display = 'grid'
			setEventHandlersForTabsMenu(tabList, bookmarks, 'tabs');
			break;
		}
		case 'accessibility': {
			byId('overlay-options').style.display = 'grid'
			setEventHandlersForAccessibilityMenu(isDwellingActive, useNavAreas, useRobotJS);
			break;
		}
		case 'bookmarks': {
			byId('overlay-tabs').style.display = 'grid'
			setEventHandlersForTabsMenu(tabList, bookmarks, 'bookmarks');
			break;
		}
		case 'precisionClick': {
			byId('overlay-precisionClick').style.display = 'grid'
			setEventHandlersForPrecisionClick(dwellTime, precisionDwellRange);
			break;
		}
		case 'settings': {
			byId('overlay-settings').style.display = 'grid'
			setEventHandlersForSettingsMenu(settings);
			break;
		}
	}
});

ipcRenderer.on('ipc-trigger-click-under-cursor', (event) => {
	const mouse = getMouse();
	const element = document.elementFromPoint(mouse.x, mouse.y);
	if (element) {
		element.click();
	}
});

ipcRenderer.on('ipc-setting-keyboard-input', (event, value) => {
	const inputField = byId('url');
	if (inputField) {
		inputField.textContent = value;
	}
})

ipcRenderer.on('ipc-setting-update-dwell-time-css', (event, optionValue) => {
	console.log('ipc-setting-update-dwell-time-css', optionValue);
	const root = document.documentElement;
	root.style.setProperty('--dwell-time', `${optionValue}ms`);
})

function setEventHandlersForOmniMenu() {
	// =================================
	// ======== OMNIBOX OVERLAY ========
	// =================================
	const refreshOmniBtn = byId('refreshPageBtn')
	const searchOmniBtn = byId('searchBtn')
	const bookmarkOmniBtn = byId('bookmarkPageBtn')
	const viewBookmarksOmniBtn = byId('showBookmarksBtn')
	const cancelOmniBtn = byId('cancel-omni')
	const omnibox = byId('omnibox')
	const cancelSearchBtn = byId('cancel-search')
	const submitSearchBtn = byId('submit-search')
	const overlaySearchBox = byId('overlay-search')
	const inputSearchBox = byId('searchText')

	dwell(cancelOmniBtn, () => {
		ipcRenderer.send('ipc-overlays-remove');
	})

	// // =================================
	// // ======== OMNIBOX OVERLAY ========
	// // =================================

	// var bookmarksWebview

	// const overlayOmnibox = byId('overlay-omnibox')
	// const refreshOmniBtn = byId('refreshPageBtn')
	// const searchOmniBtn = byId('searchBtn')
	// const bookmarkOmniBtn = byId('bookmarkPageBtn')
	// const viewBookmarksOmniBtn = byId('showBookmarksBtn')
	// const cancelOmniBtn = byId('cancel-omni')
	// const omnibox = byId('omnibox')
	// const cancelSearchBtn = byId('cancel-search')
	// const submitSearchBtn = byId('submit-search')
	// const overlaySearchBox = byId('overlay-search')
	// const inputSearchBox = byId('searchText')

	// dialog = byId('dialog')
	// dialogMessage = byId('dialogMessage')
	// dialogErrorIcon = byId('dialogError')
	// dialogSuccessIcon = byId('dialogSuccess')

	// dwell(omnibox, () => {
	//   hideAllOverlays()
	//   overlayOmnibox.style.display = 'grid'
	// })

	// dwell(cancelOmniBtn, () => {
	//   overlayOmnibox.style.display = 'none'
	// })

	// dwell(refreshOmniBtn, reload)

	// dwell(searchOmniBtn, () => {
	//   hideAllOverlays()
	//   overlaySearchBox.style.display="grid"
	//   inputSearchBox.focus();
	// })

	// dwell(submitSearchBtn, () => {
	//   hideAllOverlays()
	//   overlaySearchBox.style.display="none"
	//   webview.loadURL("https://www.bing.com/search?q=" + inputSearchBox.value).then(() => {
	//     console.debug('ok');
	//   }).catch((ex) =>
	//     {
	//       console.debug(ex);
	//     });
	// })

	// dwell(cancelSearchBtn, () => {
	//   overlaySearchBox.style.display = 'none'
	// })

	// // BOOKMARKS
	// dwell(bookmarkOmniBtn, () => {
	//   let bookmarksPath = path.join(__dirname, 'bookmarks.json')
	//   fs.readFile(bookmarksPath, 'utf8', (err, data) => {
	//     let bMarkName = webview.src.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
	//     var bookmark = { url: webview.src, name: bMarkName}

	//     if (err) {
	//       return err
	//     } else {
	//       var bookmarks = JSON.parse(data)
	//       var exists = false;

	//       for(var i=0; bookmarks.bookmarks.length > i; i++) {
	//         if (bookmarks.bookmarks[i].url === bookmark.url) {
	//           exists = true;
	//         }
	//       }

	//       if (!exists) {
	//         bookmarks.bookmarks.push(bookmark)
	//         let bookmarksJson = JSON.stringify(bookmarks)
	//         fs.writeFile(bookmarksPath, bookmarksJson, 'utf8', (err) => {
	//           if (err) throw err
	//         })
	//         dialogMessage.innerHTML = 'Bookmark added succesfully!'
	//         dialogErrorIcon.style.display = 'none'
	//         dialogSuccessIcon.style.display = 'block'
	//       } else {
	//         dialogSuccessIcon.style.display = 'none'
	//         dialogMessage.innerHTML = 'Bookmark already exists!'
	//         dialogErrorIcon.style.display = 'block'
	//       }
	//     }
	//   })

	//   hideAllOverlays()
	//   dialog.style.display = 'flex'
	//   setTimeout(() => {
	//     dialog.classList.add('fadeOutDown')
	//   }, 3000);

	//   setTimeout(() => {
	//     dialog.style.display = 'none'
	//     dialog.classList.remove('fadeOutDown')
	//   }, 3600);
	// })

	// dwell(viewBookmarksOmniBtn, () => {
	//   webviewContainer = byId('webview-container')
	//   webviewContainer.insertAdjacentHTML('beforeend', `
	//     <webview id="bookmarkview" class="webpage" src="./bookmarks.html" preload="./injectBookmark.js" autosize="on"></webview>
	//   `)
	//   hideAllOverlays()
	//   bookmarksWebview = byId('bookmarkview')

	//   bookmarksWebview.addEventListener('mouseover', () => {
	//     cursor.style.visibility = 'hidden'
	//   })

	//   bookmarksWebview.addEventListener('mouseout', () => {
	//     cursor.style.visibility = 'visible'
	//   })

	//   bookmarksWebview.addEventListener('dom-ready', () => {
	//     // bookmarksWebview.openDevTools()
	//   })

	//   webview.style.display = 'none';
	//   bookmarksWebview.style.display = 'flex'

	//   let bookmarksPath = path.join(__dirname, 'bookmarks.json')
	//   let bookmarksJson = fs.readFileSync(bookmarksPath, 'utf8')

	//   bookmarksWebview.addEventListener('dom-ready', () => {
	//     bookmarksWebview.send('getBookmarks', bookmarksJson)
	//   })

	//   ipcRenderer.on('loadBookmark', (event, message) => {
	//     webview.loadURL(message)
	//     // webview.src = message
	//     webview.style.display = 'flex'
	//     bookmarksWebview.style.display = 'none'
	//     document.getElementById("bookmarkview").remove();
	//   })
	// })

	// ipcRenderer.on('closeBookmarks', () => {
	//   webview.style.display = 'flex'
	//   bookmarksWebview.style.display = 'none'
	//   document.getElementById("bookmarkview").remove();
	// })


	// // webview.addEventListener('dom-ready', () => {
	// //   // Insert CSS to Webview
	// //   var head = document.getElementsByTagName('head')[0]
	// //   var linkToWebviewCss = head.children[4].href
	// //   readFile(linkToWebviewCss, (css, err) => {
	// //     if (err) throw err
	// //     var cssContent = String(css)
	// //     webview.insertCSS(cssContent)
	// //   })
	// // })

	// })
}

function setEventHandlersForAccessibilityMenu(isDwellingActive, useNavAreas, useRobotJS) {
	// =================================
	// ======== OPTIONS OVERLAY ========
	// =================================

	const refreshBtn = byId('refreshBtn')
	const settingsBtn = byId('settingsBtn')
	const zoomInBtn = byId('zoomInBtn')
	const zoomOutBtn = byId('zoomOutBtn')
	const resetZoomBtn = byId('resetZoomBtn')
	const toggleDwellBtn = byId('toggleDwellBtn')
	const toggleNavBtn = byId('toggleNavBtn')
	const toggleLinkClickingBtn = byId('toggleClickBtn')
	const exitBtn = byId('exitBtn')
	const cancelOptionsBtn = byId('cancel-options')
	// const bookmarksBtn = byId('bookmarksBtn')
	// const aboutBtn = byId('aboutBtn')

	let dwellingIcon = toggleDwellBtn.getElementsByTagName('i')[0];
	dwellingIcon.innerText = isDwellingActive ? 'toggle_on' : 'toggle_off';
	dwellingIcon.style.color = dwellingIcon.innerText === 'toggle_on' ? '#10468b' : '#aaacbb';

	let navIcon = toggleNavBtn.getElementsByTagName('i')[0];
	navIcon.innerText = useNavAreas ? 'toggle_on' : 'toggle_off';
	navIcon.style.color = navIcon.innerText === 'toggle_on' ? '#10468b' : '#aaacbb';

	let clickIcon = toggleLinkClickingBtn.getElementsByTagName('i')[0];
	clickIcon.innerText = useRobotJS ? 'toggle_on' : 'toggle_off';
	clickIcon.style.color = clickIcon.innerText === 'toggle_on' ? '#10468b' : '#aaacbb';

	dwell(refreshBtn, () => {
		ipcRenderer.send('ipc-overlays-refresh');
	})

	dwell(settingsBtn, () => {
		ipcRenderer.send('ipc-overlays-settings');
	})

	dwell(zoomInBtn, () => {
		ipcRenderer.send('ipc-overlays-zoom-in');
	})

	dwell(zoomOutBtn, () => {
		ipcRenderer.send('ipc-overlays-zoom-out');
	})

	dwell(resetZoomBtn, () => {
		ipcRenderer.send('ipc-overlays-zoom-reset');
	})

	dwell(toggleDwellBtn, () => {
		ipcRenderer.send('ipc-overlays-toggle-dwell');
		let icon = toggleDwellBtn.getElementsByTagName('i')[0];
		icon.innerText = icon.innerText === 'toggle_on' ? 'toggle_off' : 'toggle_on';
		icon.style.color = icon.innerText === 'toggle_on' ? '#10468b' : '#aaacbb';
	})
	
	dwell(toggleNavBtn, () => {
		ipcRenderer.send('ipc-overlays-toggle-nav');
		let icon = toggleNavBtn.getElementsByTagName('i')[0];
		icon.innerText = icon.innerText === 'toggle_on' ? 'toggle_off' : 'toggle_on';
		icon.style.color = icon.innerText === 'toggle_on' ? '#10468b' : '#aaacbb';
	})

	dwell(toggleLinkClickingBtn, () => {
		ipcRenderer.send('ipc-overlays-toggle-useRobotJS');
		let icon = toggleLinkClickingBtn.getElementsByTagName('i')[0];
		icon.innerText = icon.innerText === 'toggle_on' ? 'toggle_off' : 'toggle_on';
		icon.style.color = icon.innerText === 'toggle_on' ? '#10468b' : '#aaacbb';
	})

	dwell(exitBtn, () => {
		ipcRenderer.send('ipc-exit-browser');
	})

	dwell(cancelOptionsBtn, () => {
		ipcRenderer.send('ipc-overlays-remove');
	})

	// dwell(bookmarksBtn, () => {
	// 	ipcRenderer.send('ipc-overlays-view-bookmarks');
	// })

	// dwell(aboutBtn, () => {
	// 	ipcRenderer.send('ipc-overlays-about');
	// })
}

function setEventHandlersForNavigationMenu(canGoBack, canGoForward) {
	// =================================
	// ====== NAVIGATION OVERLAY =======
	// =================================

	let cancelNavBtn = byId('cancel-nav')
	let backNavBtn = byId('goBackBtn')
	let forwardNavBtn = byId('goForwardBtn')

	dwell(cancelNavBtn, () => {
		ipcRenderer.send('ipc-overlays-remove');
	})

	dwell(backNavBtn, () => {
		if (canGoBack) {
			ipcRenderer.send('ipc-overlays-back');
			ipcRenderer.send('ipc-overlays-remove');
		} else {
			let icon = backNavBtn.querySelector('i')
			icon.classList.add('shake')

			icon.addEventListener('webkitAnimationEnd', () => {
				icon.classList.remove('shake')
			})
		}
	});

	dwell(forwardNavBtn, () => {
		if (canGoForward) {
			ipcRenderer.send('ipc-overlays-forward');
			ipcRenderer.send('ipc-overlays-remove');
		} else {
			let icon = forwardNavBtn.querySelector('i')
			icon.classList.add('shake')

			icon.addEventListener('webkitAnimationEnd', () => {
				icon.classList.remove('shake')
			})
		}
	});

	if (canGoForward) {
		dwell(forwardNavBtn, () => {
			ipcRenderer.send('ipc-overlays-forward');
			ipcRenderer.send('ipc-overlays-remove');
		})
	} else {

	}
}

function setEventHandlersForTabsMenu(tabList, bookmarks, overlay) {
	// =================================
	// ======== TABS OVERLAY ===========
	// =================================		
	isBookmarksOverlay = overlay === 'bookmarks';
	let cancelTabsBtn = byId('cancel-tabs')
	let tabsContainer = byId('tabsContainer');
	let tabCounter = byId('tabCounter');
	let scrollUpBtn = byId('scrollUpBtn')
	let newTabBtn = byId('newTabBtn')
	let scrollDownBtn = byId('scrollDownBtn')
	let roundedBookmark = '<svg xmlns="http://www.w3.org/2000/svg" height="2.3rem" viewBox="0 -960 960 960" width="2.3rem"><path d="M333.33-259 480-347l146.67 89-39-166.67 129-112-170-15L480-709l-66.67 156.33-170 15 129 112.34-39 166.33ZM480-269 300.67-161q-9 5.67-19 5-10-.67-17.67-6.33-7.67-5.67-11.67-14.5-4-8.84-1.66-19.84L298-401 139.67-538.67q-8.67-7.66-10.5-17.16-1.84-9.5.83-18.5t10-15q7.33-6 18.67-7.34L368-615l81-192.67q4.33-10 13.17-15 8.83-5 17.83-5 9 0 17.83 5 8.84 5 13.17 15L592-615l209.33 18.33q11.34 1.34 18.67 7.34 7.33 6 10 15t.83 18.5q-1.83 9.5-10.5 17.16L662-401l47.33 204.33q2.34 11-1.66 19.84-4 8.83-11.67 14.5-7.67 5.66-17.67 6.33-10 .67-19-5L480-269Zm0-204.33Z"/></svg>';
	let roundedBookmarkFilled = '<svg xmlns="http://www.w3.org/2000/svg" height="2.3rem" viewBox="0 -960 960 960" width="2.3rem"><path d="M480-269 294-157q-8 5-17 4.5t-16-5.5q-7-5-10.5-13t-1.5-18l49-212-164-143q-8-7-9.5-15.5t.5-16.5q2-8 9-13.5t17-6.5l217-19 84-200q4-9 12-13.5t16-4.5q8 0 16 4.5t12 13.5l84 200 217 19q10 1 17 6.5t9 13.5q2 8 .5 16.5T826-544L662-401l49 212q2 10-1.5 18T699-158q-7 5-16 5.5t-17-4.5L480-269Z"/></svg>';

	// Clearing any existing tabs
	tabsContainer.innerHTML = '';
	dwell(cancelTabsBtn, () => ipcRenderer.send('ipc-overlays-remove-and-update'))

	if (isBookmarksOverlay && bookmarks.length === 0) {
		// If the bookmarks overlay is empty, show a message
		displayNoBookmarksMessage();
	}

	// Setting up the sidebar 
	setupSidebar();

	// Populating the overlay with tabs or bookmarks
	list = isBookmarksOverlay ? bookmarks : tabList;
	list.forEach((tab) => {
		const tabElement = createTabElement(tab);
		tabsContainer.appendChild(tabElement);
	});

	scrollToActiveTab();

	function setupSidebar() {
		// If the overlay is the bookmarks overlay, the new tab button is hidden and the tab counter is set to the number of bookmarks instead
		if (isBookmarksOverlay) {
			tabCounter.innerHTML = bookmarks.length + ((bookmarks.length == 1) ? ' Bookmark' : ' Bookmarks');
			newTabBtn.style.display = 'none';
		} else {
			tabCounter.innerHTML = tabList.length + ((tabList.length == 1) ? ' Tab' : ' Tabs');
			dwell(newTabBtn, () => {
				ipcRenderer.send('ipc-overlays-newTab');
			})
		}

		dwellInfinite(scrollUpBtn, () => scrollByOneRow(-1))
		dwellInfinite(scrollDownBtn, () => scrollByOneRow(1))
	}

	function createTabElement(tab) {
		const tabElement = document.createElement('div');
		tabElement.classList.add('tab', 'fadeInDown');
		tab.isActive === true ? tabElement.classList.add('tab--active') : null;

		// Adding the tab snapshot
		const tabImage = document.createElement('div');
		tabImage.classList.add('overlayBtn', 'tabImage');
		tabImage.style.backgroundImage = `url(${tab.snapshot})`; // Set the background image to the tab snapshot

		// Adding the title overlay
		const tabImageOverlay = document.createElement('div');
		tabImageOverlay.classList.add('overlayBtn', 'tabImage', 'tabImage--overlay');
		tabImageOverlay.innerHTML = tab.title;

		dwell(tabImageOverlay, () => {
			// Remove the active class from all tabs
			const tabList = tabsContainer.querySelectorAll('.tab');
			tabList.forEach(tab => tab.classList.remove('tab--active'));

			tabElement.classList.add('tab--active');

			if (isBookmarksOverlay) {
				// If the bookmarks overlay is active, notify the main process to load the bookmarked page in the same tab
				ipcRenderer.send('ipc-overlays-bookmark-selected', tab.url);
			} else {
				// If the tabs overlay is active, notify the main process to open the selected tab
				setTimeout(() => ipcRenderer.send('ipc-overlays-tab-selected', tab.tabId), 300)
			}
		});

		tabElement.appendChild(tabImage);
		tabElement.appendChild(tabImageOverlay);

		if (isBookmarksOverlay) {
			addBookmarkOverlayControls(tabElement, tab);
		} else {
			addTabOverlayControls(tabElement, tab);
		}

		return tabElement;
	}

	function scrollByOneRow(direction) {
		const rowHeight = 315 + 40; // Height of a tab + gap 
		tabsContainer.scrollBy({
			top: direction * rowHeight,
			behavior: 'smooth'
		});
	}

	function addBookmarkOverlayControls(tabElement, tab) {
		const deleteBookmarkBtn = document.createElement('div');
		deleteBookmarkBtn.classList.add('overlayBtn', 'tabBottomBtn');
		deleteBookmarkBtn.innerHTML = '<i class="material-icons">delete</i>';

		dwell(deleteBookmarkBtn, () => {
			// Remove the bookmark from the bookmarks list
			console.log('Before deletion', bookmarks);
			bookmarks = bookmarks.filter(bookmark => bookmark.url !== tab.url);
			let deletedURL = tab.url;
			ipcRenderer.send('ipc-overlays-bookmarks-updated', bookmarks, deletedURL, "");

			// Remove the bookmark element from the DOM
			tabElement.remove();
			console.log('After deletion', bookmarks);

			// Update the tab counter
			tabCounter.innerHTML = bookmarks.length + ((bookmarks.length == 1) ? ' Bookmark' : ' Bookmarks');

			if (bookmarks.length === 0) {
				displayNoBookmarksMessage();
			}
		});

		tabElement.appendChild(deleteBookmarkBtn);
	}

	function addTabOverlayControls(tabElement, tab) {
		const tabBookmarkBtn = document.createElement('div');
		tabBookmarkBtn.classList.add('overlayBtn', 'tabBottomBtn', 'tabBottomBtn--left');
		tabBookmarkBtn.innerHTML = bookmarks.some(bookmark => bookmark.url === tab.url) ? roundedBookmarkFilled : roundedBookmark;

		const tabCloseBtn = document.createElement('div');
		tabCloseBtn.classList.add('overlayBtn', 'tabBottomBtn', 'tabBottomBtn--right');
		tabCloseBtn.innerHTML = '<i class="material-icons">close</i>';

		dwell(tabCloseBtn, () => {
			// Remove the tab from the tabList
			const tabIndex = tabList.findIndex(t => t.tabId === tab.tabId);
			if (tabIndex !== -1) tabList.splice(tabIndex, 1);

			// Remove the tab element from the DOM
			tabElement.remove();

			// Update the tab counter
			tabCounter.innerHTML = tabList.length + ((tabList.length == 1) ? ' Tab' : ' Tabs');

			// If the closed tab was active, set the last tab as active
			if (tab.isActive && tabList.length > 0) {
				tabList[tabList.length - 1].isActive = true;
				// Update the UI to reflect the new active tab
				const lastTabElement = tabsContainer.querySelector('.tab:last-child');
				if (lastTabElement) {
					lastTabElement.classList.add('tab--active');
				}
			}

			// If there are no tabs left, a new tab is created with the default URL
			if (tabList.length === 0) {
				ipcRenderer.send('ipc-overlays-newTab');
			}

			// Notify the main process to update the tabs
			ipcRenderer.send('ipc-overlays-tab-deleted', tab.tabId);
		});

		dwell(tabBookmarkBtn, () => {
			// Bookmark the tab if not already bookmarked and update UI
			if (!bookmarks.some(bookmark => bookmark.url === tab.url)) {
				let bookmark = {
					url: tab.url,
					title: tab.title,
					snapshot: tab.snapshot
				};
				bookmarks.push(bookmark);
				ipcRenderer.send('ipc-overlays-bookmarks-updated', bookmarks, "", bookmark);
				tabBookmarkBtn.innerHTML = roundedBookmarkFilled;
			} else {
				bookmarks = bookmarks.filter(bookmark => bookmark.url !== tab.url);
				let deletedURL = tab.url;
				ipcRenderer.send('ipc-overlays-bookmarks-updated', bookmarks, deletedURL, "");
				tabBookmarkBtn.innerHTML = roundedBookmark;
			}

			console.log('After bookmarking', bookmarks);

			// Updating the bookmark buttons for all tabs who have the same URL
			tabList.forEach((tab, index) => {
				const tabElement = tabsContainer.children[index];
				const tabBookmarkBtn = tabElement.querySelector('.tabBottomBtn--left');
				if (bookmarks.some(bookmark => bookmark.url === tab.url)) {
					tabBookmarkBtn.innerHTML = roundedBookmarkFilled;
				} else {
					tabBookmarkBtn.innerHTML = roundedBookmark;
				}
			});
		});

		tabElement.appendChild(tabBookmarkBtn);
		tabElement.appendChild(tabCloseBtn);
	}

	function displayNoBookmarksMessage() {
		const noBookmarksMessage = document.createElement('div');
		noBookmarksMessage.classList.add('noBookmarksMessage', 'fadeInUp');
		noBookmarksMessage.innerHTML = 'No bookmarks found';

		tabCounter.style.display = 'none';
		tabsContainer.style.display = 'flex';
		tabsContainer.style.justifyContent = 'center';
		tabsContainer.appendChild(noBookmarksMessage);
	}

	function scrollToActiveTab() {
		const activeTabElement = tabsContainer.querySelector('.tab--active');
		if (activeTabElement) {
			setTimeout(activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'center' }), 2000)
		}
	}
}

function setEventHandlersForPrecisionClick(dwellTime, precisionDwellRange) {
	// =================================
	// ==== PRECISION CLICK OVERLAY ====
	// =================================

	let cancelPrecisionClickBtn = byId('cancel-precision-click');
	let zoomInBtn = byId('zoomIn');
	let zoomOutBtn = byId('zoomOut');
	let scrollUp = byId('scrollUp');
	let scrollDown = byId('scrollDown');
	let webpage = byId('webpage');

	let dwellTimeout;
	let lastX = 0, lastY = 0;

	dwell(cancelPrecisionClickBtn, () => {
		ipcRenderer.send('ipc-overlays-zoom-reset');
		ipcRenderer.send('ipc-overlays-remove');
		ipcRenderer.send('ipc-precision-add-scroll-buttons');
	});

	scrollUp.addEventListener('mouseenter', () => {
		ipcRenderer.send('ipc-precision-scroll-up');
	});

	scrollDown.addEventListener('mouseenter', () => {
		ipcRenderer.send('ipc-precision-scroll-down');
	});

	scrollUp.addEventListener('mouseleave', () => {
		ipcRenderer.send('ipc-precision-scroll-stop');
	});

	scrollDown.addEventListener('mouseleave', () => {
		ipcRenderer.send('ipc-precision-scroll-stop');
	});

	dwellInfinite(zoomInBtn, () => {
		ipcRenderer.send('ipc-precision-zoom-in');
	});

	dwellInfinite(zoomOutBtn, () => {
		ipcRenderer.send('ipc-precision-zoom-out');
	});

	webpage.addEventListener("mousemove", (event) => {
		const { clientX: x, clientY: y } = event;

		// Check if cursor movement is within range
		if (Math.abs(x - lastX) < precisionDwellRange && Math.abs(y - lastY) < precisionDwellRange) {
			startCursorAnimation(); // Show the cursor animation

			if (!dwellTimeout) {
				dwellTimeout = setTimeout(() => {
					console.log("Dwell selection triggered!");
					ipcRenderer.send('ipc-overlays-remove');
					simulateClick(x, y);
					ipcRenderer.send('ipc-precision-add-scroll-buttons');
					ipcRenderer.send('ipc-overlays-zoom-reset');
					resetDwell();
				}, dwellTime);
			}
		} else {
			stopCursorAnimation(); // Stop the cursor animation
			resetDwell(); // Reset if movement is too large
		}

		lastX = x;
		lastY = y;
	});

	webpage.addEventListener("mouseleave", () => {
		stopCursorAnimation(); // Stop the cursor animation
		resetDwell(); // Reset if movement is too large
	});

	function resetDwell() {
		clearTimeout(dwellTimeout);
		dwellTimeout = null;
	}

	// Simulate a click at a given coordinate
	function simulateClick(x, y) {
		ipcRenderer.send('ipc-precision-dwelltime-elapsed');
	}

}

function setEventHandlersForSettingsMenu(settings) {
	console.log('settings: ', settings);
	const settingsCardsContainer = byId('settingsCardsContainer');
	const scrollUpBtn = byId('settingsScrollUpBtn');
	const scrollDownBtn = byId('settingsScrollDownBtn');
	const cancelSettingsBtn = byId('cancel-settings');

	// Clear existing settings cards
	settingsCardsContainer.innerHTML = '';

	// Group settings by category
	const groupedSettings = groupSettingsByCategory(settings);

	// Populate settings cards grouped by category
	Object.keys(groupedSettings).forEach(category => {
		// Create and append category title
		const categoryTitle = document.createElement('h2');
		categoryTitle.textContent = category;
		categoryTitle.classList.add('settingCategory');
		settingsCardsContainer.appendChild(categoryTitle);

		// Create and append settings cards for the category
		groupedSettings[category].forEach(setting => {
			const card = createSettingCard(setting);
			settingsCardsContainer.appendChild(card);
		});
	});

	// Scroll functionality
	dwellInfinite(scrollUpBtn, () => scrollByOneRow(-1, settingsCardsContainer));
	dwellInfinite(scrollDownBtn, () => scrollByOneRow(1, settingsCardsContainer));

	// Close button functionality
	dwell(cancelSettingsBtn, () => {
		ipcRenderer.send('ipc-overlays-remove');
	});

	function groupSettingsByCategory(settings) {
		return Object.values(settings).reduce((grouped, setting) => {
			const category = setting.category || 'General Settings';
			if (!grouped[category]) {
				grouped[category] = [];
			}
			grouped[category].push(setting);
			return grouped;
		}, {});
	}

	function scrollByOneRow(direction, container) {
		console.log('scrolling by one row', direction);
		const rowHeight = 400;
		container.scrollBy({
			top: direction * rowHeight,
			behavior: 'smooth'
		});
	}

	function createSettingCard(setting) {
		const card = document.createElement('div');
		card.classList.add('settingCard', 'fadeInUp');

		const title = document.createElement('h3');
		title.textContent = setting.label;
		card.appendChild(title);

		const description = document.createElement('p');
		description.textContent = setting.description;
		card.appendChild(description);

		// Add options container for settings with multiple options
		const optionsContainer = document.createElement('div');
		optionsContainer.classList.add('optionsContainer');

		// Add toggle button for settings with a single option
		if (!setting.options || setting.options.length === 1) {
			const defaultValue = document.createElement('div');
			defaultValue.id = 'url'
			defaultValue.classList.add('option', 'overlayBtn');
			defaultValue.textContent = setting.value

			dwell(defaultValue, () => {
				let elementProperties = {
					id: 'url',
					value: setting.value,
					type: 'text',
					isSetting: true,
				}
				ipcRenderer.send('ipc-settings-show-keyboard', elementProperties);
			});

			optionsContainer.appendChild(defaultValue);
		} else {
			// Adjust layout based on the number of options
			if (setting.options.length === 4) {
				optionsContainer.classList.add('optionsContainer--fourOptions');
			}

			setting.options.forEach(option => {
				const optionElement = document.createElement('div');
				optionElement.classList.add('option', 'overlayBtn');

				if (option.value == setting.value) {
					optionElement.classList.add('option--selected');
				}
				optionElement.textContent = option.label;

				dwell(optionElement, () => {
					ipcRenderer.send('ipc-settings-option-selected', setting, option.value);
					
					// Updating css for the selected option
					optionElement.classList.add('option--selected');

					// Removing css from all other options
					const allOptions = optionsContainer.querySelectorAll('.option');
					allOptions.forEach(opt => {
						if (opt !== optionElement) {
							opt.classList.remove('option--selected');
						}
					});
				});

				optionsContainer.appendChild(optionElement);
			});
		}

		card.appendChild(optionsContainer);

		return card;
	}
}