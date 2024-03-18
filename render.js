const fs = require('original-fs');
const path = require('path');
const { ipcRenderer, BrowserView } = require('electron');
const { byId, readFile, dwell } = require('./js/utils');
const { drop, isEqual } = require('lodash');
const Config = require('./js/config');
const { createCursor, followCursor } = require('./js/cursor');

ipcRenderer.send('getBrowserViewInstance');

var backOrForward, omni, browserView;
var cancelNavBtn, backNavBtn, forwardNavBtn, overlayNav;
var dialog, dialogMessage, dialogErrorIcon, dialogSuccessIcon;
var timeoutScroll;

omni = byId('url');
console.log(process.type);
let cursor;

ipcRenderer.on('browserViewInstance', (event, browserView) => {
  const webviewContainer = document.getElementById('webview-container');
  webviewContainer.appendChild(browserView);
  browserView.setAutoResize({
    width: true,
    height: true,
    horizontal: true,
    vertical: true,
  });
  browserView.webContents.on('did-start-loading', loadingOmnibox);
  browserView.webContents.on('dom-ready', () => {
    createCursor('cursor');
    cursor = document.getElementById('cursor');
    followCursor('cursor');

    browserView.addEventListener('mouseover', () => {
      cursor.style.visibility = 'hidden';
    });

    browserView.addEventListener('mouseout', () => {
      cursor.style.visibility = 'visible';
    });
  });

  dialog = byId('dialog');
  dialogMessage = byId('dialogMessage');
  dialogErrorIcon = byId('dialogError');
  dialogSuccessIcon = byId('dialogSuccess');

  omni.onkeydown = sanitiseUrl;
  omni.onclick = displayUrl;
  browserView.webContents.on('did-start-loading', loadingOmnibox);

  // Sanitises URL
  function sanitiseUrl(event) {
    if (event.keyCode === 13) {
      omni.blur();
      let val = omni.value;
      let https = val.slice(0, 8).toLowerCase();
      let http = val.slice(0, 7).toLowerCase();
      if (https === 'https://') {
        browserView.webContents.loadURL(val);
      } else if (http === 'http://') {
        browserView.webContents.loadURL('https://' + val);
      } else {
        browserView.webContents.loadURL('https://' + val);
      }
    }
  }
});

// =================================
// ==== Browser Functionality ======
// =================================
function reload() {
  browserView.webContents.reload();
}

function goBack() {
  browserView.webContents.goBack();
}

function goForward() {
  browserView.webContents.goForward();
}

function loadingOmnibox() {
  let loader = byId('loader');
  let favicon = byId('favicon');

  const loadStart = () => {
    favicon.style.display = 'none';
    loader.style.display = 'block';
    omni.value = 'Loading..';
  };

  const loadStop = () => {
    favicon.style.display = 'block';
    loader.style.display = 'none';
    omni.value = browserView.webContents.getTitle();
  };

  browserView.webContents.addEventListener('did-start-loading', loadStart);
  browserView.webContents.addEventListener('did-stop-loading', loadStop);
}

function displayUrl() {
  omni.classList.add('fadeOutDown');
  setTimeout(() => {
    omni.classList.remove('fadeOutDown');
    omni.value = browserView.webContents.getURL();
    omni.classList.add('fadeInUp');
  }, 200);
}

// =================================
// ==== Scrolling Functionality ====
// =================================

var scrollUpBtn, scrollDownBtn;
scrollUpBtn = byId('scroll-up');
scrollDownBtn = byId('scroll-down');
//browserView.webContents.addEventListener('dom-ready', scroller())

ipcRenderer.on('hideScrollUp', () => {
  scrollUpBtn.style.display = 'none';
});

ipcRenderer.on('showScrollUp', () => {
  scrollUpBtn.style.display = 'flex';
});

function scroller() {
  scrollUpBtn.onmouseover = () => {
    timeoutScroll = setInterval(() => {
      browserView.webContents.executeJavaScript(
        'document.documentElement.scrollBy(0, -10)',
      );
    }, 20);
  };

  scrollUpBtn.onmouseout = () => {
    if (timeoutScroll) {
      clearInterval(timeoutScroll);
    }
  };

  scrollDownBtn.onmouseover = () => {
    timeoutScroll = setInterval(() => {
      browserView.webContents.executeJavaScript(
        'document.documentElement.scrollBy(0, 10)',
      );
    }, 20);
  };

  scrollDownBtn.onmouseout = () => {
    if (timeoutScroll) {
      clearInterval(timeoutScroll);
    }
  };
}

// ======== HIDE ALL OVERLAYS ========
function hideAllOverlays() {
  // Hide navigation overlay
  overlayNav.style.display = 'none';
  // Hide omnibox overlay
  overlayOmnibox.style.display = 'none';
  // Hide options overlay
  overlayOptions.style.display = 'none';
  // Hide search overlay
  overlaySearchBox.style.display = 'none';
}

// =================================
// ====== NAVIGATION OVERLAY =======
// =================================

var backOrForward, cancelNavBtn, backNavBtn, forwardNavBtn, overlayNav;

backOrForward = byId('backOrForwardBtn');
cancelNavBtn = byId('cancel-nav');
backNavBtn = byId('goBackBtn');
forwardNavBtn = byId('goForwardBtn');
overlayNav = byId('overlay-nav');

dwell(backOrForward, () => {
  hideAllOverlays();
  const canGoBack = browserView.webContents.canGoBack();
  const canGoForward = browserView.webContents.canGoForward();

  if (!canGoBack && canGoForward) {
    overlayNav.id = 'overlay-nav-forward-only';
    backNavBtn.style.display = 'none';
    forwardNavBtn.style.display = 'flex';
    overlayNav = byId('overlay-nav-forward-only');
    overlayNav.style.display = 'grid';
  } else if (canGoBack && !canGoForward) {
    overlayNav.id = 'overlay-nav-back-only';
    backNavBtn.style.display = 'flex';
    forwardNavBtn.style.display = 'none';
    overlayNav = byId('overlay-nav-back-only');
    overlayNav.style.display = 'grid';
  } else if (canGoBack && canGoForward) {
    overlayNav.id = 'overlay-nav';
    backNavBtn.style.display = 'flex';
    forwardNavBtn.style.display = 'flex';
    overlayNav = byId('overlay-nav');
    overlayNav.style.display = 'grid';
  } else {
    backOrForward.classList.add('shake');
    backOrForward.addEventListener('webkitAnimationEnd', () => {
      backOrForward.classList.remove('shake');
    });
    overlayNav.style.display = 'none';
  }
});

dwell(cancelNavBtn, () => {
  overlayNav.style.display = 'none';
});

dwell(backNavBtn, goBack);

dwell(forwardNavBtn, goForward);

// =================================
// ======== OMNIBOX OVERLAY ========
// =================================

const refreshOmniBtn = byId('refreshPageBtn');
const searchOmniBtn = byId('searchBtn');
const bookmarkOmniBtn = byId('bookmarkPageBtn');
const viewBookmarksOmniBtn = byId('showBookmarksBtn');
const cancelOmniBtn = byId('cancel-omni');
const omnibox = byId('omnibox');
const overlayOmnibox = byId('overlay-omnibox');
const overlaySearchBox = byId('overlay-search');
const inputSearchBox = byId('searchText');

dwell(omnibox, () => {
  hideAllOverlays();
  overlayOmnibox.style.display = 'grid';
});

dwell(cancelOmniBtn, () => {
  overlayOmnibox.style.display = 'none';
});

dwell(refreshOmniBtn, reload);

dwell(searchOmniBtn, () => {
  hideAllOverlays();
  overlaySearchBox.style.display = 'grid';
  inputSearchBox.focus();
});

// BOOKMARKS
dwell(bookmarkOmniBtn, () => {
  let bookmarksPath = path.join(__dirname, 'bookmarks.json');
  fs.readFile(bookmarksPath, 'utf8', (err, data) => {
    let bMarkName = browserView.webContents
      .getURL()
      .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
      .split('/')[0];
    var bookmark = { url: browserView.webContents.getURL(), name: bMarkName };

    if (err) {
      return err;
    } else {
      var bookmarks = JSON.parse(data);
      var exists = false;

      for (var i = 0; bookmarks.bookmarks.length > i; i++) {
        if (bookmarks.bookmarks[i].url === bookmark.url) {
          exists = true;
        }
      }

      if (!exists) {
        bookmarks.bookmarks.push(bookmark);
        let bookmarksJson = JSON.stringify(bookmarks);
        fs.writeFile(bookmarksPath, bookmarksJson, 'utf8', (err) => {
          if (err) throw err;
        });
        dialogMessage.innerHTML = 'Bookmark added succesfully!';
        dialogErrorIcon.style.display = 'none';
        dialogSuccessIcon.style.display = 'block';
      } else {
        dialogSuccessIcon.style.display = 'none';
        dialogMessage.innerHTML = 'Bookmark already exists!';
        dialogErrorIcon.style.display = 'block';
      }
    }
  });

  hideAllOverlays();
  dialog.style.display = 'flex';
  setTimeout(() => {
    dialog.classList.add('fadeOutDown');
  }, 3000);

  setTimeout(() => {
    dialog.style.display = 'none';
    dialog.classList.remove('fadeOutDown');
  }, 3600);
});

dwell(viewBookmarksOmniBtn, () => {
  const webContents = browserView.webContents;

  // Load the bookmarks HTML page into the existing BrowserView
  webContents.loadURL(`file://${__dirname}/bookmarks.html`);

  hideAllOverlays();

  // Handle cursor visibility
  webContents.on('dom-ready', () => {
    webContents.insertCSS('body { cursor: none; }');
  });

  // Show the bookmarks view and hide the main view
  webContents.on('dom-ready', () => {
    browserWindow.webContents.executeJavaScript(`
          document.getElementById('webview-container').style.display = 'none';
      `);
  });

  // Handle bookmark loading
  ipcRenderer.on('loadBookmark', (event, message) => {
    webContents.loadURL(message);
    browserWindow.webContents.executeJavaScript(`
          document.getElementById('webview-container').style.display = 'flex';
      `);
  });
});

ipcRenderer.on('closeBookmarks', () => {
  browserView.webContents.executeJavaScript(`
    document.getElementById('webview-container').style.display = 'flex';
    document.getElementById('bookmarkview').style.display = 'none';
    document.getElementById('bookmarkview').remove();
  `);
});

// =================================
// ======== OPTIONS OVERLAY ========
// =================================

// ZOOMING
const overlayOptions = byId('overlay-options');
const zoomInBtn = byId('zoomInBtn');
const zoomOutBtn = byId('zoomOutBtn');
const resetZoomBtn = byId('resetZoomBtn');
const cancelOptionsBtn = byId('cancel-options');
const options = byId('menuBtn');

dwell(options, () => {
  hideAllOverlays();
  overlayOptions.style.display = 'grid';
});

dwell(zoomInBtn, () => {
  webview.send('zoomIn');
  overlayOptions.style.display = 'none';
});

dwell(zoomOutBtn, () => {
  webview.send('zoomOut');
  overlayOptions.style.display = 'none';
});

dwell(resetZoomBtn, () => {
  webview.send('zoomReset');
  overlayOptions.style.display = 'none';
});

dwell(cancelOptionsBtn, () => {
  overlayOptions.style.display = 'none';
});

// browserView.webContents.on('dom-ready', () => {
//   // Insert CSS to Webview
//   var head = document.getElementsByTagName('head')[0];
//   var linkToWebviewCss = head.children[4].href;
//   readFile(linkToWebviewCss, (css, err) => {
//     if (err) throw err;
//     var cssContent = String(css);
//     browserView.webContents.insertCSS(cssContent);
//   });
// });

// ======== SIDEBAR ========
let allLinksReceived = [];

// const sidebarMaxLinks = Config.sidebarMaxLinks
const lengthTitle = Config.sidebarLengthTitle;
const lengthUrl = Config.sidebarLengthUrl;
let sidebar = byId('sidebar_items');

// ========================
// HYPERLINK NAVIGATION
// ========================

ipcRenderer.on('getLinks', (event, message) => {
  // byId('sidebar_header_title').innerHTML = 'Links'
  allLinksReceived.push(...message);
  let linksInSidebar = [];
  let linksToShow = [];
  let numberOfLinksToDelete = 0;

  var sidebarItems = Array.from(
    document.getElementsByClassName('sidebar_item'),
  );
  if (sidebarItems.length) {
    let sidebarUrls = sidebarItems.map(
      (item) =>
        `${item.firstElementChild.lastElementChild.getAttribute('data-link')}`,
    );
    for (var i = 0; i < sidebarUrls.length; i++) {
      var sidebarLink = allLinksReceived.find(
        (link) => link.url === sidebarUrls[i],
      );
      if (sidebarLink) {
        linksInSidebar.push(sidebarLink);
      }
    }
  }

  // Replace links
  if (!linksInSidebar.length) {
    linksToShow = message.filter((link) => link.title && link.url);
  } else if (isEqual(linksInSidebar, message)) {
    linksToShow = [];
  } else {
    numberOfLinksToDelete = linksInSidebar.length;
    linksToShow = message.filter((link) => link.title && link.url);
  }

  if (numberOfLinksToDelete && sidebarItems.length) {
    for (i = 0; i < numberOfLinksToDelete; i++) {
      sidebarItems[i].classList.add('fadeOutDown');
      let iter = i;
      sidebarItems[i].addEventListener('webkitAnimationEnd', () => {
        sidebarItems[iter].remove();
        drop(linksInSidebar, numberOfLinksToDelete);
        displayHyperlinks();
      });
    }
  }

  function displayHyperlinks() {
    if (linksToShow.length) {
      const markup = `${linksToShow
        .map(
          (link) =>
            `<div class='sidebar_item fadeInDown' id='${link.id}'>
          <div>
            <div class='sidebar_item_title'>
              ${
                link.title.length <= lengthTitle
                  ? link.title
                  : link.title.substring(0, lengthTitle) + '...'
              }
            </div>
            <div class='sidebar_item_link' data-link='${link.url}'>
              ${
                link.url.length <= lengthUrl
                  ? link.url.replace(/^https?:\/\//i, '')
                  : link.url
                      .replace(/^https?:\/\//i, '')
                      .substring(0, lengthUrl) + '...'
              }
            </div>
          </div>
          <div class='sidebar_item_icon'>
            <i class="fas fa-angle-right"></i>
          </div>
        </div>
        `,
        )
        .join('')}`;

      sidebar.insertAdjacentHTML('afterbegin', markup);
      linksToShow = [];

      sidebarItems = document.querySelectorAll('.sidebar_item');
      if (sidebarItems.length) {
        for (i = 0; i < sidebarItems.length; i++) {
          (function (i) {
            dwell(sidebarItems[i], () => {
              browserView.webContents.loadURL(
                sidebarItems[i].firstElementChild.lastElementChild.getAttribute(
                  'data-link',
                ),
              );
            });
          })(i);
          // sidebarItems[i].addEventListener('mouseover', getLink)
        }
      }
    }
  }

  if (!numberOfLinksToDelete) {
    displayHyperlinks();
  }

  // function getLink() {
  //   dwell(this, () => {
  //     webview.src = this.firstElementChild.lastElementChild.getAttribute('data-link')
  //   })
  // }
});

// ========================
// NAVBAR NAVIGATION
// ========================

let allNavItemsReceived = [];

ipcRenderer.on('getNavLinks', (event, message) => {
  message = JSON.parse(message);
  allNavItemsReceived.push(...message);
  webview.classList.add('darken');
  let navArray = message;
  let linksToShow = [];
  linksToShow = navArray.filter((link) => link.parent === 1);

  renderLinks(linksToShow);

  function renderLinks(links) {
    emptySidebar();

    links = markLinksWithChildren(links);

    const markup = `${links
      .map(
        (link) =>
          `<div class='sidebar_item fadeInDown' data-id='${link.id}'>
        <div>
          <div class='sidebar_item_title'>
            ${
              link.title.length <= lengthTitle
                ? link.title
                : link.title.substring(0, lengthTitle) + '...'
            }
          </div>
          <div class='sidebar_item_link' data-link='${
            link.href ? link.href : ' No Link '
          }'>
            ${link.href ? link.href.substring(0, lengthUrl) : ' No Link '}
          </div>
        </div>
        <div class='sidebar_item_icon'>
          <i class="${
            link.children ? 'fas fa-bars' : 'fas fa-angle-right'
          }"></i>
        </div>
      </div>
      `,
      )
      .join('')}`;

    sidebar.insertAdjacentHTML('beforeend', markup);

    let sidebarItems = document.querySelectorAll('.sidebar_item');
    if (sidebarItems.length) {
      for (var i = 0; i < sidebarItems.length; i++) {
        (function (i) {
          dwell(sidebarItems[i], () => {
            let linkId = parseInt(sidebarItems[i].getAttribute('data-id'));
            linksToShow = navArray.filter((link) => link.parent === linkId);
            renderLinks(linksToShow);
            if (!linksToShow.length) {
              browserView.webContents.loadURL(
                sidebarItems[i].firstElementChild.lastElementChild.getAttribute(
                  'data-link',
                ),
              );
            }
          });
        })(i);
      }
    }
  }

  function emptySidebar() {
    sidebar.innerHTML = '';
  }

  function markLinksWithChildren(links) {
    return links.map((link) => {
      if (hasChildren(link.id)) {
        return { ...link, children: true };
      } else {
        return { ...link, children: false };
      }
    });
  }
  function hasChildren(id) {
    return allNavItemsReceived.some((link) => link.parent === id);
  }
});

// ========================
// SIDEBAR EVENTS
// ========================

document.addEventListener('DOMContentLoaded', (event) => {
  var sidebarItems = document.querySelectorAll('#sidebar_items .sidebar_item');
  if (sidebarItems.length) {
    for (var i = 0; i < sidebarItems.length; i++) {
      (function (i) {
        sidebarItems[i].addEventListener('click', () => {
          let id = parseInt(sidebarItems[i].getAttribute('data-id'));
          let title = sidebarItems[i].querySelector('.sidebar_item_title').innerHTML;
          let url = sidebarItems[i].querySelector('.sidebar_item_link').getAttribute('data-link');
          let payload = {
            id,
            title,
            url,
          };
          ipcRenderer.send('sidebarClicked', JSON.stringify(payload));
        });
      })(i);
    }
  }
});

// ========================
// CURSOR EVENTS
// ========================

const cursorEvents = {
  clickable: 'pointer',
  input: 'text',
  textarea: 'text',
};

function changeCursor(type) {
  cursor.style.cursor = cursorEvents[type] || 'default';
}

// ========================
// WINDOW EVENT LISTENERS
// ========================

function emptySidebar() {
  let sidebarItems = Array.from(sidebar.getElementsByClassName('sidebar_item'));
  if (sidebarItems.length) {
    for (var i = 0; i < sidebarItems.length; i++) {
      sidebarItems[i].classList.add('fadeOutDown');
      sidebarItems[i].parentNode.removeChild(sidebarItems[i]);
    }
  }
}

// Click event to close sidebar when clicked outside of sidebar
window.addEventListener('click', function (event) {
  if (!sidebar.contains(event.target)) {
    emptySidebar();
  }
});

// Resize event listener
window.addEventListener('resize', function () {
  emptySidebar();
});
