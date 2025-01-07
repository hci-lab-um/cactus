const { ipcRenderer } = require('electron')
const { byId, dwell, dwellInfinite } = require('../../../src/tools/utils')
const { createCursor, followCursor, getMouse } = require('../../../src/tools/cursor')
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

ipcRenderer.on('ipc-main-overlays-loaded', (event, overlayAreaToShow, tabData = null) => {
	const { tabList, bookmarks } = tabData;
	switch (overlayAreaToShow) {
		case 'omni': {
			byId('overlay-omnibox').style.display = 'grid'
			setEventHandlersForOmniMenu()
			break;
		}
		case 'navigation': {
			byId('overlay-nav').style.display = 'grid'
			setEventHandlersForNavigationMenu();
			break;
		}
		case 'tabs': {
			byId('overlay-tabs').style.display = 'grid'
			setEventHandlersForTabsMenu(tabList, bookmarks);
			break;
		}
		case 'accessibility': {
			byId('overlay-options').style.display = 'grid'
			setEventHandlersForAccessibilityMenu();
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

function setEventHandlersForAccessibilityMenu() {
	// =================================
	// ======== OPTIONS OVERLAY ========
	// =================================

	// ZOOMING
	const settingsBtn = byId('settingsBtn')
	const toggleDwellBtn = byId('toggleDwellBtn')
	const zoomInBtn = byId('zoomInBtn')
	const zoomOutBtn = byId('zoomOutBtn')
	const resetZoomBtn = byId('resetZoomBtn')
	const cancelOptionsBtn = byId('cancel-options')

	dwell(settingsBtn, () => {
		ipcRenderer.send('ipc-overlays-settings');
	})

	dwell(toggleDwellBtn, () => {
		ipcRenderer.send('ipc-overlays-toggle-dwell');
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

	dwell(cancelOptionsBtn, () => {
		ipcRenderer.send('ipc-overlays-remove');
	})
}

function setEventHandlersForNavigationMenu() {
	// =================================
	// ====== NAVIGATION OVERLAY =======
	// =================================

	let cancelNavBtn = byId('cancel-nav')
	let backNavBtn = byId('goBackBtn')
	let forwardNavBtn = byId('goForwardBtn')

	// dwell(backOrForward, () => {
	//   if(!webview.canGoBack() && webview.canGoForward()) {
	//     overlayNav.id = 'overlay-nav-forward-only'
	//     backNavBtn.style.display = 'none'
	//     forwardNavBtn.style.display = 'flex'
	//     overlayNav = byId('overlay-nav-forward-only')
	//     overlayNav.style.display = 'grid'
	//   } else if (!webview.canGoForward() && webview.canGoBack()) {
	//     overlayNav.id = 'overlay-nav-back-only'
	//     backNavBtn.style.display = 'flex'
	//     forwardNavBtn.style.display = 'none'
	//     overlayNav = byId('overlay-nav-back-only')
	//     overlayNav.style.display = 'grid'
	//   } else if (webview.canGoBack() && webview.canGoForward()) {
	//     overlayNav.id = 'overlay-nav'
	//     backNavBtn.style.display = 'flex'
	//     forwardNavBtn.style.display = 'flex'
	//     overlayNav = byId('overlay-nav')
	//     overlayNav.style.display = 'grid'
	//   } else {
	//     backOrForward.classList.add('shake')

	//     backOrForward.addEventListener('webkitAnimationEnd', () => {
	//       backOrForward.classList.remove('shake')
	//     })

	//     overlayNav.style.display = 'none'
	//   }
	// })

	dwell(cancelNavBtn, () => {
		ipcRenderer.send('ipc-overlays-remove');
	})

	dwell(backNavBtn, () => {
		ipcRenderer.send('ipc-overlays-back');
		ipcRenderer.send('ipc-overlays-remove');
	});

	dwell(forwardNavBtn, () => {
		ipcRenderer.send('ipc-overlays-forward');
		ipcRenderer.send('ipc-overlays-remove');
	});

	ipcRenderer.on('ipc-overlays-back-check', (event, canGoBack) => {
		backNavBtn.style.display = canGoBack ? 'flex' : 'none';
	})

	ipcRenderer.on('ipc-overlays-forward-check', (event, canGoForward) => {
		forwardNavBtn.style.display = canGoForward ? 'flex' : 'none';
	})
}

function setEventHandlersForTabsMenu(tabList, bookmarks) {
	// =================================
	// ======== TABS OVERLAY ===========
	// =================================

	let cancelTabsBtn = byId('cancel-tabs')
	let newTabBtn =  byId('newTabBtn')
	let scrollUpBtn = byId('scrollUpBtn')
	let scrollDownBtn = byId('scrollDownBtn')

	let tabsContainer = byId('tabsContainer');
	tabsContainer.innerHTML = ''; // Clear existing tabs

	let tabCounter = byId('tabCounter');
	tabCounter.innerHTML = tabList.length + ((tabList.length == 1) ? ' Tab' : ' Tabs');

	dwell(cancelTabsBtn, () => {
		ipcRenderer.send('ipc-overlays-remove');
	})

	dwell(newTabBtn, () => {
		ipcRenderer.send('ipc-overlays-newTab');
	})

	dwellInfinite(scrollUpBtn, () => {
		scrollByOneRow(-1);
	})

	dwellInfinite(scrollDownBtn, () => {
		scrollByOneRow(1);
	})

	let roundedBookmark = '<svg xmlns="http://www.w3.org/2000/svg" height="2.3rem" viewBox="0 -960 960 960" width="2.3rem" fill="#10468b"><path d="M333.33-259 480-347l146.67 89-39-166.67 129-112-170-15L480-709l-66.67 156.33-170 15 129 112.34-39 166.33ZM480-269 300.67-161q-9 5.67-19 5-10-.67-17.67-6.33-7.67-5.67-11.67-14.5-4-8.84-1.66-19.84L298-401 139.67-538.67q-8.67-7.66-10.5-17.16-1.84-9.5.83-18.5t10-15q7.33-6 18.67-7.34L368-615l81-192.67q4.33-10 13.17-15 8.83-5 17.83-5 9 0 17.83 5 8.84 5 13.17 15L592-615l209.33 18.33q11.34 1.34 18.67 7.34 7.33 6 10 15t.83 18.5q-1.83 9.5-10.5 17.16L662-401l47.33 204.33q2.34 11-1.66 19.84-4 8.83-11.67 14.5-7.67 5.66-17.67 6.33-10 .67-19-5L480-269Zm0-204.33Z"/></svg>';
	let roundedBookmarkFilled = '<svg xmlns="http://www.w3.org/2000/svg" height="2.3rem" viewBox="0 -960 960 960" width="" fill="#10468b"><path d="M480-269 294-157q-8 5-17 4.5t-16-5.5q-7-5-10.5-13t-1.5-18l49-212-164-143q-8-7-9.5-15.5t.5-16.5q2-8 9-13.5t17-6.5l217-19 84-200q4-9 12-13.5t16-4.5q8 0 16 4.5t12 13.5l84 200 217 19q10 1 17 6.5t9 13.5q2 8 .5 16.5T826-544L662-401l49 212q2 10-1.5 18T699-158q-7 5-16 5.5t-17-4.5L480-269Z"/></svg>';

	// Addind a tab in the tabs overlay for each tab found in the tablist.
	tabList.forEach((tab, index) => {
		const tabElement = document.createElement('div');
		tabElement.classList.add('tab', 'fadeInDown');
		tab.isActive === true ? tabElement.classList.add('tab--active') : null;

		const tabImage = document.createElement('div');
		tabImage.classList.add('overlayBtn', 'tabImage');
		tabImage.style.backgroundImage = `url(${tab.snapshot})`; // Set the background image to the tab snapshot

		const tabBookmarkBtn = document.createElement('div');
		tabBookmarkBtn.classList.add('overlayBtn', 'tabBottomBtn', 'tabBottomBtn--left');
		tabBookmarkBtn.innerHTML = bookmarks.includes(tab.url) ? roundedBookmarkFilled : roundedBookmark;

		const tabCloseBtn = document.createElement('div');
		tabCloseBtn.classList.add('overlayBtn', 'tabBottomBtn', 'tabBottomBtn--right');
		tabCloseBtn.innerHTML = '<i class="material-icons">close</i>';

		dwell(tabImage, () => {
			// Remove the active class from all tabs
			const tabList = tabsContainer.querySelectorAll('.tab');
			tabList.forEach(tab => tab.classList.remove('tab--active'));

			// Add the active class to the clicked tab
			tabElement.classList.add('tab--active');

			// Update the main process with the new active tab
			ipcRenderer.send('ipc-overlays-tab-selected', index);
		});

		dwell(tabCloseBtn, () => {
            // Remove the tab from the tabList
            tabList.splice(index, 1);

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
            ipcRenderer.send('ipc-overlays-tab-deleted', index);
        });

		dwell(tabBookmarkBtn, () => {
			// Add the current tab's URL to the list of bookmarked pages
			const tabURL = tab.url
			if (!bookmarks.includes(tabURL)) {
				bookmarks.push(tabURL);
				ipcRenderer.send('ipc-bookmarks-updated', bookmarks);
				tabBookmarkBtn.innerHTML = roundedBookmarkFilled;
			} else {
				bookmarks = bookmarks.filter(bookmark => bookmark !== tabURL);
				ipcRenderer.send('ipc-bookmarks-updated', bookmarks);
				tabBookmarkBtn.innerHTML = roundedBookmark;
			}

			// Updating the bookmark buttons for all tabs who have the same URL
			tabList.forEach((tab, index) => {
				const tabElement = tabsContainer.children[index];
				const tabBookmarkBtn = tabElement.querySelector('.tabBottomBtn--left');
				if (bookmarks.includes(tab.url)) {
					tabBookmarkBtn.innerHTML = roundedBookmarkFilled;
				} else {
					tabBookmarkBtn.innerHTML = roundedBookmark;
				}
			});
		});

		tabElement.appendChild(tabImage);
		tabElement.appendChild(tabBookmarkBtn);
		tabElement.appendChild(tabCloseBtn);

		tabsContainer.appendChild(tabElement);
	});

	// Scrolling to the active tab
    const activeTabElement = tabsContainer.querySelector('.tab--active');
    if (activeTabElement) {
        setTimeout(activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'center' }), 2000)
    }

	function scrollByOneRow(direction) {
        const rowHeight = 315 + 40; // Height of a tab + gap 
        tabsContainer.scrollBy({
            top: direction * rowHeight,
            behavior: 'smooth'
        });
    }
}