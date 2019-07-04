const fs                        = require('original-fs')
const path                      = require('path')
const { ipcRenderer }           = require('electron')
const { byId, readFile, dwell } = require('./js/utils')
const { drop, isEqual }         = require('lodash')
const Config                    = require('./js/config')
const { createCursor, followCursor } = require('./js/cursor')

var backOrForward, omni, webview
var cancelNavBtn, backNavBtn, forwardNavBtn, overlayNav
var dialog, dialogMessage, dialogErrorIcon, dialogSuccessIcon
var timeoutScroll
var webviewContainer

omni = byId('url')
webview = byId('webview')

let cursor 

webview.addEventListener('dom-ready', () => {
  // webview.openDevTools()
  createCursor('cursor')
  cursor = document.getElementById('cursor')
  followCursor('cursor')

  webview.addEventListener('mouseover', () => {
    cursor.style.visibility = 'hidden'
  })

  webview.addEventListener('mouseout', () => {
    cursor.style.visibility = 'visible'
  })

})

dialog = byId('dialog')
dialogMessage = byId('dialogMessage')
dialogErrorIcon = byId('dialogError')
dialogSuccessIcon = byId('dialogSuccess')

omni.onkeydown = sanitiseUrl
omni.onclick = displayUrl
webview.addEventListener('did-start-loading', loadingOmnibox)

// Sanitises URL
function sanitiseUrl (event) {
  if (event.keyCode === 13) {
      omni.blur();
      let val = omni.value;
      let https = val.slice(0, 8).toLowerCase();
      let http = val.slice(0, 7).toLowerCase();
      if (https === 'https://') {
        webview.loadURL(val);
      } else if (http === 'http://') {
        webview.loadURL('https://' + val);
      } else {
        webview.loadURL('https://'+ val);
      }
  }
}

// =================================
// ==== Browser Functionality ======
// =================================
function reload() {
  hideAllOverlays()
  webview.reload();
}

function goBack() {
  hideAllOverlays()
  webview.goBack();
}

function goForward() {
  hideAllOverlays()
  webview.goForward();
}

function loadingOmnibox() {
  let loader = byId('loader');
  let favicon = byId('favicon');

  const loadStart = () => {
    favicon.style.display="none";
    loader.style.display = "block";
    omni.value = 'Loading..';
  }

  const loadStop = () => {
    favicon.style.display="block"
    loader.style.display = "none"
    omni.value = webview.getTitle()
  }

  webview.addEventListener('did-start-loading', loadStart)
  webview.addEventListener('did-stop-loading', loadStop)
}

function displayUrl() {
  omni.classList.add('fadeOutDown')
  setTimeout(() => {
    omni.classList.remove('fadeOutDown')
    omni.value = webview.src;
    omni.classList.add('fadeInUp')
  }, 200);
}

// =================================
// ==== Scrolling Functionality ====
// =================================

var scrollUpBtn, scrollDownBtn
scrollUpBtn = byId('scroll-up')
scrollDownBtn = byId('scroll-down')
webview.addEventListener('dom-ready', scroller())

ipcRenderer.on('hideScrollUp', () => {
  scrollUpBtn.style.display = 'none'
})

ipcRenderer.on('showScrollUp', () => {
  scrollUpBtn.style.display = 'flex'
})

// ipcRenderer.on('hideScrollDown', () => {
//   scrollDownBtn.style.display = 'none'
// })

// ipcRenderer.on('showScrollDown', () => {
//   scrollDownBtn.style.display = 'flex'
// })

function scroller() {
  scrollUpBtn.onmouseover = () => {
    timeoutScroll = setInterval(() => {
      webview.executeJavaScript('document.documentElement.scrollBy(0, -10)');
    }, 20)
  }

  scrollUpBtn.onmouseout = () => {
    if (timeoutScroll) {
      clearInterval(timeoutScroll)
    }
  }

  scrollDownBtn.onmouseover = () => {
    timeoutScroll = setInterval(() => {
      webview.executeJavaScript('document.documentElement.scrollBy(0, 10)');
    }, 20)
  }

  scrollDownBtn.onmouseout = () => {
    if (timeoutScroll) {
      clearInterval(timeoutScroll)
    }
  }
}

// ======== HIDE ALL OVERLAYS ========
function hideAllOverlays() {
  if (overlayNav) overlayNav.style.display = 'none'
  if (overlayOmnibox) overlayOmnibox.style.display = 'none'
  if (overlayOptions) overlayOptions.style.display = 'none'
}

// =================================
// ====== NAVIGATION OVERLAY =======
// =================================

backOrForward = byId('backOrForwardBtn')
cancelNavBtn = byId('cancel-nav')
backNavBtn = byId('goBackBtn')
forwardNavBtn = byId('goForwardBtn')
overlayNav = byId('overlay-nav')

dwell(backOrForward, () => {
  hideAllOverlays()
  if(!webview.canGoBack() && webview.canGoForward()) {
    overlayNav.id = 'overlay-nav-forward-only'
    backNavBtn.style.display = 'none'
    forwardNavBtn.style.display = 'flex'
    overlayNav = byId('overlay-nav-forward-only')
    overlayNav.style.display = 'grid'
  } else if (!webview.canGoForward() && webview.canGoBack()) {
    overlayNav.id = 'overlay-nav-back-only'
    backNavBtn.style.display = 'flex'
    forwardNavBtn.style.display = 'none'
    overlayNav = byId('overlay-nav-back-only')
    overlayNav.style.display = 'grid'
  } else if (webview.canGoBack() && webview.canGoForward()) {
    overlayNav.id = 'overlay-nav'
    backNavBtn.style.display = 'flex'
    forwardNavBtn.style.display = 'flex'
    overlayNav = byId('overlay-nav')
    overlayNav.style.display = 'grid'
  } else {
    backOrForward.classList.add('shake')

    backOrForward.addEventListener('webkitAnimationEnd', () => {
      backOrForward.classList.remove('shake')
    })

    overlayNav.style.display = 'none'
  }
})

dwell(cancelNavBtn, () => {
  overlayNav.style.display = 'none'
})

dwell(backNavBtn, goBack)

dwell(forwardNavBtn, goForward)

// =================================
// ======== OMNIBOX OVERLAY ========
// =================================

var bookmarksWebview

const overlayOmnibox = byId('overlay-omnibox')
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

dwell(omnibox, () => {
  hideAllOverlays()
  overlayOmnibox.style.display = 'grid'
})

dwell(cancelOmniBtn, () => {
  overlayOmnibox.style.display = 'none'
})

dwell(refreshOmniBtn, reload)

dwell(searchOmniBtn, () => {
  hideAllOverlays()
  overlaySearchBox.style.display="grid"
  inputSearchBox.focus();
})

dwell(submitSearchBtn, () => {
  hideAllOverlays()
  overlaySearchBox.style.display="none"
  webview.src = "https://www.google.com/search?q=" + inputSearchBox.value;
})

dwell(cancelSearchBtn, () => {
  overlaySearchBox.style.display = 'none'
})

// BOOKMARKS 
dwell(bookmarkOmniBtn, () => {
  let bookmarksPath = path.join(__dirname, 'bookmarks.json')
  fs.readFile(bookmarksPath, 'utf8', (err, data) => {
    let bMarkName = webview.src.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
    var bookmark = { url: webview.src, name: bMarkName}

    if (err) {
      return err
    } else {
      var bookmarks = JSON.parse(data)
      var exists = false;

      for(var i=0; bookmarks.bookmarks.length > i; i++) {
        if (bookmarks.bookmarks[i].url === bookmark.url) {
          exists = true;
        }
      }

      if (!exists) {
        bookmarks.bookmarks.push(bookmark)
        let bookmarksJson = JSON.stringify(bookmarks)
        fs.writeFile(bookmarksPath, bookmarksJson, 'utf8', (err) => {
          if (err) throw err
        })
        dialogMessage.innerHTML = 'Bookmark added succesfully!'
        dialogErrorIcon.style.display = 'none'
        dialogSuccessIcon.style.display = 'block'
      } else {
        dialogSuccessIcon.style.display = 'none'
        dialogMessage.innerHTML = 'Bookmark already exists!'
        dialogErrorIcon.style.display = 'block'
      }
    }
  })

  hideAllOverlays()
  dialog.style.display = 'flex'
  setTimeout(() => {
    dialog.classList.add('fadeOutDown')
  }, 3000);

  setTimeout(() => {
    dialog.style.display = 'none'
    dialog.classList.remove('fadeOutDown')
  }, 3600);
})

dwell(viewBookmarksOmniBtn, () => {
  webviewContainer = byId('webview-container')
  webviewContainer.insertAdjacentHTML('beforeend', `
    <webview id="bookmarkview" class="webpage" src="./bookmarks.html" preload="./injectBookmark.js" autosize="on"></webview>
  `)
  hideAllOverlays()
  bookmarksWebview = byId('bookmarkview')

  bookmarksWebview.addEventListener('mouseover', () => {
    cursor.style.visibility = 'hidden'
  })

  bookmarksWebview.addEventListener('mouseout', () => {
    cursor.style.visibility = 'visible'
  })

  bookmarksWebview.addEventListener('dom-ready', () => {
    // bookmarksWebview.openDevTools()
  })

  webview.style.display = 'none';
  bookmarksWebview.style.display = 'flex'

  let bookmarksPath = path.join(__dirname, 'bookmarks.json')
  let bookmarksJson = fs.readFileSync(bookmarksPath, 'utf8')

  bookmarksWebview.addEventListener('dom-ready', () => {
    bookmarksWebview.send('getBookmarks', bookmarksJson)
  })

  ipcRenderer.on('loadBookmark', (event, message) => {
    webview.src = message
    webview.style.display = 'flex'
    bookmarksWebview.style.display = 'none'
    document.getElementById("bookmarkview").remove();
  })
})

ipcRenderer.on('closeBookmarks', () => {
  webview.style.display = 'flex'
  bookmarksWebview.style.display = 'none'
  document.getElementById("bookmarkview").remove();
})

// =================================
// ======== OPTIONS OVERLAY ========
// =================================

// ZOOMING
const overlayOptions = byId('overlay-options')
const zoomInBtn = byId('zoomInBtn')
const zoomOutBtn = byId('zoomOutBtn')
const resetZoomBtn = byId('resetZoomBtn')
const cancelOptionsBtn = byId('cancel-options')
const options = byId('menuBtn')

dwell(options, () => {
  hideAllOverlays()
  overlayOptions.style.display = 'grid'
})

dwell(zoomInBtn, () => {
  webview.send("zoomIn")
  overlayOptions.style.display = 'none'
})

dwell(zoomOutBtn, () => {
  webview.send("zoomOut")
  overlayOptions.style.display = 'none'
})

dwell(resetZoomBtn, () => {
  webview.send("zoomReset")
  overlayOptions.style.display = 'none'
})

dwell(cancelOptionsBtn, () => {
  overlayOptions.style.display = 'none'
})

webview.addEventListener('dom-ready', () => {
  // Insert CSS to Webview
  var head = document.getElementsByTagName('head')[0]
  var linkToWebviewCss = head.children[4].href
  readFile(linkToWebviewCss, (css, err) => {
    if (err) throw err
    var cssContent = String(css)
    webview.insertCSS(cssContent)
  })
})

// ======== SIDEBAR ========
let allLinksReceived = []

// const sidebarMaxLinks = Config.sidebarMaxLinks
const lengthTitle = Config.sidebarLengthTitle
const lengthUrl = Config.sidebarLengthUrl
let sidebar = byId('sidebar_items')

// ========================
// HYPERLINK NAVIGATION
// ========================

ipcRenderer.on('getLinks', (event, message) => {
  // byId('sidebar_header_title').innerHTML = 'Links'
  allLinksReceived.push(...message)
  let linksInSidebar = []
  let linksToShow = []
  let numberOfLinksToDelete = 0

  var sidebarItems = Array.from(document.getElementsByClassName('sidebar_item'))
  if (sidebarItems.length) {
    let sidebarUrls = sidebarItems.map(item => `${item.firstElementChild.lastElementChild.getAttribute('data-link')}`)
    for (var i=0; i < sidebarUrls.length; i++) {
      var sidebarLink = allLinksReceived.find(link => link.url === sidebarUrls[i])
      if (sidebarLink) {
        linksInSidebar.push(sidebarLink)
      }
    }
  }

  // Replace links
  if (!linksInSidebar.length) {
    linksToShow = message.filter(link => link.title && link.url)
  } else if (isEqual(linksInSidebar, message)) {
    linksToShow = []
  } else {
    numberOfLinksToDelete = linksInSidebar.length
    linksToShow = message.filter(link => link.title && link.url)
  }

  if (numberOfLinksToDelete && sidebarItems.length) {
    for (i=0; i < numberOfLinksToDelete; i++) {
      sidebarItems[i].classList.add('fadeOutDown')
      let iter = i
      sidebarItems[i].addEventListener('webkitAnimationEnd', () => {
        sidebarItems[iter].parentNode.removeChild(sidebarItems[iter])
        drop(linksInSidebar, numberOfLinksToDelete)
        displayHyperlinks()
      })
    }
  }

  function displayHyperlinks() {
    if (linksToShow.length) {
      const markup = `${linksToShow.map(link =>
        `<div class='sidebar_item fadeInDown' id='${link.id}'>
          <div>
            <div class='sidebar_item_title'>
              ${link.title.length <= lengthTitle ? link.title : link.title.substring(0, lengthTitle)+'...'}
            </div>
            <div class='sidebar_item_link' data-link='${link.url}'>
              ${link.url.length <= lengthUrl ? link.url.replace(/^https?:\/\//i, "") : link.url.replace(/^https?:\/\//i, "").substring(0, lengthUrl)+'...'}
            </div>
          </div>
          <div class='sidebar_item_icon'>
            <i class="fas fa-angle-right"></i>
          </div>
        </div>
        `).join('')}`
  
      sidebar.insertAdjacentHTML('beforeend', markup);
      linksToShow = []

      sidebarItems = document.querySelectorAll('.sidebar_item')
      if (sidebarItems.length) {
        for (i=0; i < sidebarItems.length; i++) {
          (function(i) {
            dwell(sidebarItems[i], () => {
              webview.src = sidebarItems[i].firstElementChild.lastElementChild.getAttribute('data-link')
            })
          })(i)
          // sidebarItems[i].addEventListener('mouseover', getLink)
        }
      }
    }
  }

  if (!numberOfLinksToDelete) {
    displayHyperlinks()
  }

  // function getLink() {
  //   dwell(this, () => {
  //     webview.src = this.firstElementChild.lastElementChild.getAttribute('data-link')
  //   })
  // }
})

// ========================
// NAVBAR NAVIGATION
// ========================

let allNavItemsReceived = []

ipcRenderer.on('getNavLinks', (event, message) => {
  allNavItemsReceived.push(...message)
  webview.classList.add('darken')
  let navArray = message
  let linksToShow = []
  linksToShow = navArray.filter(link => link.parent === 1)

  renderLinks(linksToShow)

  function renderLinks(links) {
    emptySidebar()

    links = markLinksWithChildren(links)

    const markup = `${links.map(link =>
      `<div class='sidebar_item fadeInDown' data-id='${link.id}'>
        <div>
          <div class='sidebar_item_title'>
            ${link.title.length <= lengthTitle ? link.title : link.title.substring(0, lengthTitle)+'...'}
          </div>
          <div class='sidebar_item_link' data-link='${link.href ? link.href : " No Link "}'>
            ${link.href ? link.href.substring(0, lengthUrl) : " No Link "}
          </div>
        </div>
        <div class='sidebar_item_icon'>
          <i class="${link.children ? 'fas fa-bars' : 'fas fa-angle-right'}"></i>
        </div>
      </div>
      `).join('')}`

    sidebar.insertAdjacentHTML('beforeend', markup);

    let sidebarItems = document.querySelectorAll('.sidebar_item')
    if (sidebarItems.length) {
      for (var i=0; i < sidebarItems.length; i++) {
        (function(i) {
          dwell(sidebarItems[i], () => {
            let linkId = parseInt(sidebarItems[i].getAttribute('data-id'))
            linksToShow = navArray.filter(link => link.parent === linkId)
            renderLinks(linksToShow)
            if (!linksToShow.length) {
              webview.src = sidebarItems[i].firstElementChild.lastElementChild.getAttribute('data-link')
              webview.classList.remove('darken')
            }
          })
        })(i)
        // sidebarItems[i].addEventListener('mouseover', loadLink)
      }
    }
  }

  function emptySidebar() {
    let sidebarItems = Array.from(sidebar.getElementsByClassName('sidebar_item'))
    if (sidebarItems.length) {
      for (var i=0; i < sidebarItems.length; i++) {
        sidebarItems[i].classList.add('fadeOutDown')
        sidebarItems[i].parentNode.removeChild(sidebarItems[i])
      }
    }
  }

  function markLinksWithChildren(links) {
    let linksToShow = links
    if (linksToShow.length) {
      for (var i=0; i < navArray.length; i++) {
        for (var j=0; j < linksToShow.length; j++) {
          if (linksToShow[j] === navArray[i]) {
            let linksWithParent = navArray.filter(link => link.parent === linksToShow[j].id)
            if (linksWithParent.length) {
              linksToShow[j].children = 1
            }
          }
        }
      }
    }
    return linksToShow
  }
})