const { app, BrowserWindow, BrowserView, ipcMain } = require('electron')
const path = require('path')
const { log } = require('electron-log');

let mainWindow
let overlaysWindow;
let browserView;

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
    
    //Create browser view
    browserView = new BrowserView({ 
      //https://www.electronjs.org/docs/latest/tutorial/security
      webPreferences: {
        nodeIntegrationInWorker: true,
        contextIsolation: false,
        preload: path.join(__dirname, '/render-browserview.js')
      }
    });

    //Overlays modal browser window
    overlaysWindow = new BrowserWindow({ 
      parent: mainWindow,
      titleBarStyle: 'hidden',
      titleBarOverlay: true,
      modal: true,
      show: false,
      transparent: false, // Make the view transparent
      backgroundColor: '#00000000', // Set the background color to transparent
      //https://www.electronjs.org/docs/latest/tutorial/security
      webPreferences: {
        nodeIntegrationInWorker: true,
        contextIsolation: false,
        preload: path.join(__dirname, '/render-browserview-overlays.js')
      }
    });
    
    
    mainWindow.maximize();
    mainWindow.loadURL(path.join(__dirname, '/index.html')).then(() => {
      mainWindow.webContents.send('mainWindowLoaded');
      //mainWindow.webContents.openDevTools();

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
        browserView.webContents.loadURL('https://www.accessibility.com.mt/');

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
          browserView.webContents.openDevTools();
        });

        //Attach overlays browserview
        //mainWindow.addBrowserView(overlaysWindow);
        overlaysWindow.loadURL(path.join(__dirname, '/overlays.html'))
        overlaysWindow.setBounds({ 
          x: Math.floor(properties.x), 
          y: Math.floor(properties.y), 
          width: Math.floor(properties.width), 
          height: Math.floor(properties.height) });
        // //Set auto resize
        // overlaysWindow.setAutoResize({
        //   width: true,
        //   height: true, 
        //   horizontal: true,
        //   vertical: false
        // });
        overlaysWindow.once('ready-to-show', () => {
          //overlaysWindow.show()
          overlaysWindow.webContents.send('browserViewLoaded');
          overlaysWindow.webContents.insertCSS('html, body, a, input, button, div { cursor: none; }')
          //overlaysWindow.webContents.openDevTools();
        })
        // //Once the DOM is ready, send a message to initiate some further logic
        // overlaysBrowserView.webContents.on('dom-ready', () => {
        //   // This event fires when the BrowserView is attached
        //   overlaysBrowserView.webContents.send('browserViewLoaded');
        //   overlaysBrowserView.webContents.insertCSS('html, body, a, input, button, div { cursor: none; }')
        //   overlaysBrowserView.webContents.openDevTools();
        // });
      })
      .catch(err =>
      {
        log.error(err);
      }); 
    })

    //mainWindow.webContents.openDevTools()
    
    mainWindow.on('closed', () => {
      mainWindow = null
    });
  }
  catch(err) {
    log.error(err);
  }
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

ipcMain.on('browserViewScrollDown', () => {
  browserView.webContents.send('browserViewScrollDown');
});

ipcMain.on('browserViewScrollUp', () => {
  browserView.webContents.send('browserViewScrollUp');
});

ipcMain.on('scrollingCompleted', () => {
  browserView.webContents.send('create-quadtree');
})

ipcMain.on('foundElementsInMouseRange', (event, elements) => {
  mainWindow.webContents.send('renderElementsInSideBar', elements)
})

ipcMain.on('getLinks', (event, message) => {
  mainWindow.webContents.send('getLinks', message)
})

ipcMain.on('getNavLinks', (event, message) => {
  mainWindow.webContents.send('getNavLinks', message)
})

ipcMain.on('loadBookmark', (event, message) => {
  mainWindow.webContents.send('loadBookmark', message)
})

ipcMain.on('closeBookmarks', (event, message) => {
  mainWindow.webContents.send('closeBookmarks', message)
})

ipcMain.on('hideScrollUp', () => {
  mainWindow.webContents.send('hideScrollUp')
})

ipcMain.on('log', (event,loggedItem) => {
  log.info(event);
  log.info(loggedItem);
});

ipcMain.on('showScrollUp', () => {
  mainWindow.webContents.send('showScrollUp')
})