const { ipcRenderer }           = require('electron')
const { byId, dwell } = require('./js/utils')
const { createCursor, followCursor } = require('./js/cursor')

ipcRenderer.on('overlayMenusLoaded', (event, overlayToShow) => {
    createCursor('cactus_cursor');
    followCursor('cactus_cursor');
    
    switch(overlayToShow){
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

function setEventHandlersForOmniMenu(){
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
    ipcRenderer.send('remove-overlay');
  })
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
    ipcRenderer.send('zoomIn');
  })

  dwell(zoomOutBtn, () => {
    ipcRenderer.send('zoomOut');
  })

  dwell(resetZoomBtn, () => {
    ipcRenderer.send('resetZoomLevel'); 
  })

  dwell(cancelOptionsBtn, () => {
    ipcRenderer.send('remove-overlay');
  })
}

function setEventHandlersForNavigationMenu(){
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
    ipcRenderer.send('remove-overlay');
  })

  dwell(backNavBtn, () => {
    ipcRenderer.send('ipc-overlays-back');
    ipcRenderer.send('remove-overlay');
  });

  dwell(forwardNavBtn, () => {
    ipcRenderer.send('ipc-overlays-forward');
    ipcRenderer.send('remove-overlay');
  });
  
  ipcRenderer.on('ipc-overlays-back-check', (event, canGoBack) => {
    backNavBtn.style.display = canGoBack ? 'flex' : 'none';
  })

  ipcRenderer.on('ipc-overlays-forward-check', (event, canGoForward) => {
    forwardNavBtn.style.display = canGoForward ? 'flex' : 'none';
  })
}