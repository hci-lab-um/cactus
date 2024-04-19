const { app, BrowserWindow, BrowserView, ipcMain, ipcRenderer } = require('electron')
const path = require('path')
const { log } = require('electron-log');
const { over, remove } = require('lodash');

let debugMode = false;
let mainWindow
let menusOverlay;
let defaultUrl = 'https://google.com/search?q=cats';
let tabList = [];

// const iconPath = path.join(__dirname, 'logo.png')

function createWindow () {
  try {
    mainWindow = new BrowserWindow({ 
      //https://www.electronjs.org/docs/latest/tutorial/security
      webPreferences: {
        nodeIntegrationInWorker: true,
        contextIsolation: false,
        // preload: path.join(__dirname, 'preload.js'),
        preload: path.join(__dirname, '/render-mainwindow.js'), // Set the preload script
        icon: __dirname + '/AppIcon.icns'
      },
      icon: __dirname + '/AppIcon.icns'
    })
    
    mainWindow.maximize();
    mainWindow.loadURL(path.join(__dirname, '/index.html')).then(() => {
      mainWindow.webContents.send('mainWindowLoaded');
      if (debugMode) mainWindow.webContents.openDevTools();

      //Once the main page is loaded, create inner browserview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
      mainWindow.webContents.executeJavaScript(`
        (() => {
          const element = document.querySelector('#webpage');
          if (element) {
            const rect = element.getBoundingClientRect();
            return {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            };
          } else {
            return null;
          }
        })()
      `)
      .then(properties => {
        createBrowserviewInTab(defaultUrl, properties);
      })
      .catch(err =>
      {
        log.error(err);
      }); 
    })

    if (debugMode) mainWindow.webContents.openDevTools()
    
    mainWindow.on('closed', () => {
      mainWindow = null
    });
  }
  catch(err) {
    log.error(err);
  }
}

function createBrowserviewInTab(url, properties){
  //Create browser view
  let browserView = new BrowserView({ 
    //https://www.electronjs.org/docs/latest/tutorial/security
    webPreferences: {
      nodeIntegrationInWorker: true,
      contextIsolation: false,
      preload: path.join(__dirname, '/render-browserview.js')
    }
  });
  
  //Set new tab as active (if any)
  tabList.forEach(tab => {
    tab.isActive = false
  });
  tabList.push({tabId: tabList.length+1, browserView: browserView, isActive: true});
  
  
  //Attach the browser view to the parent window
  mainWindow.addBrowserView(browserView);
  
  //Set its location/dimensions as per the returned properties
  browserView.setBounds({ 
    x: Math.floor(properties.x), 
    y: Math.floor(properties.y), 
    width: Math.floor(properties.width), 
    height: Math.floor(properties.height) });
  //Set auto resize
  browserView.setAutoResize({
    width: true,
    height: true, 
    horizontal: true,
    vertical: false
  });
  
  //Load the default home page
  browserView.webContents.loadURL(url);
  mainWindow.setTopBrowserView(browserView)
  
  //Once the DOM is ready, send a message to initiate some further logic
  browserView.webContents.on('dom-ready', () => {
    // This event fires when the BrowserView is attached
    browserView.webContents.send('browserViewLoaded');
    browserView.webContents.insertCSS(`
      html, body { overflow-x: hidden; } 
      a, input, button, div { cursor: none; }
      /* width */
      ::-webkit-scrollbar {
        width: 5px;
      }
      /* Track */
      ::-webkit-scrollbar-track {
        box-shadow: inset 0 0 5px grey; 
        border-radius: 2px;
      }
      
      /* Handle */
      ::-webkit-scrollbar-thumb {
        background: #10468b; 
        border-radius: 2px;
      }

      /* Handle on hover */
      ::-webkit-scrollbar-thumb:hover {
        background: #638eec; 
      }
    `);
    if (debugMode) browserView.webContents.openDevTools();
  });

  //Loading event - update omnibox
  browserView.webContents.on('did-start-loading', () => {
    mainWindow.webContents.send('browserview-loading-start');
  });

  browserView.webContents.on('did-stop-loading', () => {
    const url = browserView.webContents.getURL();
    const title = browserView.webContents.getTitle();
    mainWindow.webContents.send('browserview-loading-stop', { url: url, title: title });
  });

  //React to in-page navigation (e.g. anchor links)
  browserView.webContents.on('did-navigate-in-page', (event, url) => {
    const anchorTag = url.split('#')[1];
    if (anchorTag) {
      browserView.webContents.send('create-quadtree');
    }
  });

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    createBrowserviewInTab(url, properties);
  });
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// app.on('web-contents-created', (event, contents) => {
//   contents.on('will-attach-webview', (event, webPreferences, params) => {
//     webPreferences.nodeIntegration = false
//   })
// })

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

ipcMain.on('browse-to-url', (event, url) => {
  var tab = tabList.find(tab => tab.isActive === true);
  tab.browserView.webContents.loadURL(url);
});

ipcMain.on('browserViewScrollDown', () => {
  var tab = tabList.find(tab => tab.isActive === true);
  tab.browserView.webContents.send('browserViewScrollDown');
});

ipcMain.on('browserViewScrollUp', () => {
  var tab = tabList.find(tab => tab.isActive === true);
  tab.browserView.webContents.send('browserViewScrollUp');
});

// ipcMain.on('scrollingCompleted', () => {
//   browserView.webContents.send('create-quadtree');
// })

ipcMain.on('initiateInteractiveElementClickEvent', (event, elementToClick) => {
  var tab = tabList.find(tab => tab.isActive === true);
  //Once the main page is loaded, create inner browserview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
  mainWindow.webContents.executeJavaScript(`
    (() => {
      const element = document.querySelector('#webpage');
      if (element) {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        };
      } else {
        return null;
      }
    })()
  `)
  .then(properties => {
    tab.browserView.webContents.send('clickElement', elementToClick, properties.x, properties.y);
  })
  .catch(err =>
  {
    log.error(err);
  }); 

})

ipcMain.on('foundElementsInMouseRange', (event, elements) => {
  mainWindow.webContents.send('renderElementsInSideBar', elements)
})

ipcMain.on('show-overlay', (event, overlayAreaToShow) => {
  createMenuOverlay(overlayAreaToShow);
})

function removeMenusOverlay() {
  if (menusOverlay) {
    mainWindow.removeBrowserView(menusOverlay);
    menusOverlay.webContents.destroy();
    menusOverlay = null;
  }
}
ipcMain.on('remove-overlay', () =>{
  removeMenusOverlay();
})


function createMenuOverlay(overlayAreaToShow)
{
  removeMenusOverlay();

  mainWindow.webContents.executeJavaScript(`
        (() => {
          const element = document.querySelector('#webpage');
          if (element) {
            const rect = element.getBoundingClientRect();
            return {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            };
          } else {
            return null;
          }
        })()
      `)
      .then(properties => {
        //Overlays modal browser window
        menusOverlay = new BrowserView({ 
          //https://www.electronjs.org/docs/latest/tutorial/security
          webPreferences: {
            nodeIntegrationInWorker: true,
            contextIsolation: false,
            preload: path.join(__dirname, '/render-overlay-menus.js')
          }
        });

        //Attach the browser view to the parent window
        mainWindow.addBrowserView(menusOverlay);
          
        //Set its location/dimensions as per the returned properties
        menusOverlay.setBounds({ 
          x: Math.floor(properties.x), 
          y: Math.floor(properties.y), 
          width: Math.floor(properties.width), 
          height: Math.floor(properties.height) });
        //Set auto resize
        menusOverlay.setAutoResize({
          width: true,
          height: true, 
          horizontal: true,
          vertical: false
        });

        //Load the default home page
        menusOverlay.webContents.loadURL(path.join(__dirname, '/overlays.html'));
        mainWindow.setTopBrowserView(menusOverlay)
        menusOverlay.webContents.send('overlayMenusLoaded', overlayAreaToShow)
        if (debugMode) menusOverlay.webContents.openDevTools();
    })
}
// ipcMain.on('getLinks', (event, message) => {
//   mainWindow.webContents.send('getLinks', message)
// })

// ipcMain.on('getNavLinks', (event, message) => {
//   mainWindow.webContents.send('getNavLinks', message)
// })

// ipcMain.on('loadBookmark', (event, message) => {
//   mainWindow.webContents.send('loadBookmark', message)
// })

// ipcMain.on('closeBookmarks', (event, message) => {
//   mainWindow.webContents.send('closeBookmarks', message)
// })

ipcMain.on('hideScrollUp', () => {
  mainWindow.webContents.send('hideScrollUp')
})

ipcMain.on('showScrollUp', () => {
  mainWindow.webContents.send('showScrollUp')
})

ipcMain.on('go-back', () => {
  //Select active browserview
  var tab = tabList.find(tab => tab.isActive === true);
  tab.browserView.webContents.send('browserViewGoBack');
  // menusOverlay.webContents.send('can-go-forward', tab.browserView.webContents.canGoForward());
})

ipcMain.on('go-forward', () => {
  //Select active browserview
  var tab = tabList.find(tab => tab.isActive === true);
  tab.browserView.webContents.send('browserViewGoForward');
  // menusOverlay.webContents.send('can-go-forward', tab.browserView.webContents.canGoForward());
})

ipcMain.on('zoomIn', (event) => {
  //Select active browserview
  var tab = tabList.find(tab => tab.isActive === true);
  var zoomLevel = tab.browserView.webContents.getZoomLevel();
  tab.browserView.webContents.setZoomLevel(zoomLevel+1);
  removeMenusOverlay();
})

ipcMain.on('zoomOut', (event) => {
  //Select active browserview
  var tab = tabList.find(tab => tab.isActive === true);
  var zoomLevel = tab.browserView.webContents.getZoomLevel();
  tab.browserView.webContents.setZoomLevel(zoomLevel-1);
  removeMenusOverlay();
})

ipcMain.on('resetZoomLevel', (event) => {
  //Select active browserview
  var tab = tabList.find(tab => tab.isActive === true);
  tab.browserView.webContents.setZoomLevel(0);
  removeMenusOverlay();
})



ipcMain.on('log', (event,loggedItem) => {
  log.info(event);
  log.info(loggedItem);
});

