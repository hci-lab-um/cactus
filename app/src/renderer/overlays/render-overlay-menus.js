const { ipcRenderer } = require('electron')
const { byId, dwell } = require('../../../src/tools/utils')
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

ipcRenderer.on('ipc-main-overlays-loaded', (event, overlayToShow) => {
	switch (overlayToShow) {
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
	const zoomInBtn = byId('zoomInBtn')
	const zoomOutBtn = byId('zoomOutBtn')
	const resetZoomBtn = byId('resetZoomBtn')
	const cancelOptionsBtn = byId('cancel-options')

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