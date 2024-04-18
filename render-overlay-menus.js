const { ipcRenderer }           = require('electron')
const { byId, dwell } = require('./js/utils')
const { createCursor, followCursor } = require('./js/cursor')

ipcRenderer.on('overlayMenusLoaded', (event, overlayToShow) => {
    createCursor('cursor');
    followCursor('cursor');
    
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

function setEventHandlersForNavigationMenu(){
  // =================================
  // ====== NAVIGATION OVERLAY =======
  // =================================

  let backOrForward = byId('backOrForwardBtn')
  let cancelNavBtn = byId('cancel-nav')
  let backNavBtn = byId('goBackBtn')
  let forwardNavBtn = byId('goForwardBtn')
  let overlayNav = byId('overlay-nav')

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

  // dwell(backNavBtn, goBack)

  // dwell(forwardNavBtn, goForward)
}

var _browser_zoomLevel = 0
var _browser_maxZoom = 9
var _browser_minZoom = -8

ipcRenderer.on('zoomIn', () => {
  if (_browser_maxZoom > _browser_zoomLevel) {
    _browser_zoomLevel += 0.75
  }
  //webFrame.setZoomLevel(_browser_zoomLevel)
})

ipcRenderer.on('zoomOut', () => {
  if (_browser_minZoom < _browser_zoomLevel) {
    _browser_zoomLevel -= 0.75
  }
  //webFrame.setZoomLevel(_browser_zoomLevel)
})

ipcRenderer.on('zoomReset', () => {
  _browser_zoomLevel = 0
  //webFrame.setZoomLevel(_browser_zoomLevel)
})