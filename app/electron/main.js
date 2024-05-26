const { app, BrowserWindow, BrowserView, ipcMain } = require('electron')
const path = require('path')
const { log } = require('electron-log');

const isDevelopment = process.env.NODE_ENV === "development";

let mainWindow, splashWindow
let menusOverlay;
let defaultUrl = 'https://en.wikipedia.org/wiki/Glasgow';
let tabList = [];

// This method is called when Electron has finished initializing
app.whenReady().then(() => {
    createSplashWindow();
    // Show splash screen for a short while
    setTimeout(() => {
        createMainWindow();
    }, 2000);
});

// App closes when all windows are closed, however this is not default behaviour on macOS (applications and their menu bar to stay active)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS re-create window when the dock icon is clicked (with no other windows open).
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
})

ipcMain.on('browse-to-url', (event, url) => {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.loadURL(url);
});

ipcMain.on('ipc-mainwindow-scrolldown', () => {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.send('ipc-browserview-scrolldown');
});

ipcMain.on('ipc-mainwindow-scrollup', () => {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.send('ipc-browserview-scrollup');
});

ipcMain.on('ipc-mainwindow-click-sidebar-element', (event, elementToClick) => {
    var tab = tabList.find(tab => tab.isActive === true);
    //Once the main page is loaded, create inner browserview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
    tab.browserView.webContents.send('ipc-browserview-click-element', elementToClick);

})

ipcMain.on('ipc-browserview-elements-in-mouserange', (event, elements) => {
    mainWindow.webContents.send('ipc-mainwindow-sidebar-render-elements', elements)
})

ipcMain.on('ipc-mainwindow-show-overlay', (event, overlayAreaToShow) => {
    createMenuOverlay(overlayAreaToShow);
})

ipcMain.on('ipc-overlays-remove', () => {
    removeMenusOverlay();
})

ipcMain.on('ipc-browserview-scroll-up-hide', () => {
    mainWindow.webContents.send('ipc-mainwindow-scroll-up-hide')
})

ipcMain.on('ipc-browserview-scroll-up-show', () => {
    mainWindow.webContents.send('ipc-mainwindow-scroll-up-show')
})

ipcMain.on('ipc-overlays-back', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.send('ipc-browserview-back');
    // menusOverlay.webContents.send('ipc-overlays-back-check', tab.browserView.webContents.canGoForward());
})

ipcMain.on('ipc-overlays-forward', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.send('ipc-browserview-forward');
    // menusOverlay.webContents.send('ipc-overlays-forward-check', tab.browserView.webContents.canGoForward());
})

ipcMain.on('ipc-overlays-zoom-in', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    var zoomLevel = tab.browserView.webContents.getZoomLevel();
    tab.browserView.webContents.setZoomLevel(zoomLevel + 1);
    removeMenusOverlay();
})

ipcMain.on('ipc-overlays-zoom-out', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    var zoomLevel = tab.browserView.webContents.getZoomLevel();
    tab.browserView.webContents.setZoomLevel(zoomLevel - 1);
    removeMenusOverlay();
})

ipcMain.on('ipc-overlays-zoom-reset', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.setZoomLevel(0);
    removeMenusOverlay();
})

ipcMain.on('log', (event, loggedItem) => {
    log.info(event);
    log.info(loggedItem);
});

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 510,
        height: 520,
        transparent: true,
        frame: false,
        alwaysOnTop: true
    });

    // Load the splash screen HTML file
    splashWindow.loadURL(path.join(__dirname, '../src/pages/splash.html'));
}

function createMainWindow() {
    try {
        mainWindow = new BrowserWindow({
            //https://www.electronjs.org/docs/latest/tutorial/security
            webPreferences: {
                nodeIntegrationInWorker: true,
                contextIsolation: false,
                preload: path.join(__dirname, '../src/renderer/mainwindow/render-mainwindow.js')
            },
            icon: path.join(__dirname + '../../resources/logo.png'),
            show: false //until loaded
        })

        mainWindow.maximize();

        mainWindow.loadURL(path.join(__dirname, '../src/pages/index.html')).then(() => {
            mainWindow.webContents.send('mainWindowLoaded');
            if (isDevelopment) mainWindow.webContents.openDevTools();

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
                .catch(err => {
                    log.error(err);
                });
        })

        // Show the main window when it's ready
        mainWindow.once('ready-to-show', () => {

            mainWindow.show();

            // Close the splash window once the main window is ready
            if (splashWindow) {
                splashWindow.close();
            }
            if (isDevelopment) mainWindow.webContents.openDevTools()
        });

        mainWindow.on('closed', () => {
            mainWindow = null
        });
    }
    catch (err) {
        log.error(err);
    }
}

function createBrowserviewInTab(url, properties) {
    //Create browser view
    let browserView = new BrowserView({
        //https://www.electronjs.org/docs/latest/tutorial/security
        webPreferences: {
            nodeIntegrationInWorker: true,
            contextIsolation: false,
            preload: path.join(__dirname, '../src/renderer/browserview/render-browserview.js'),
        }
    });

    //Set new tab as active (if any)
    tabList.forEach(tab => {
        tab.isActive = false
    });
    tabList.push({ tabId: tabList.length + 1, browserView: browserView, isActive: true });


    //Attach the browser view to the parent window
    mainWindow.addBrowserView(browserView);

    //Set its location/dimensions as per the returned properties
    browserView.setBounds({
        x: Math.floor(properties.x),
        y: Math.floor(properties.y),
        width: Math.floor(properties.width),
        height: Math.floor(properties.height)
    });
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
        browserView.webContents.send('ipc-main-browserview-loaded');
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
        if (isDevelopment) browserView.webContents.openDevTools();
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
            browserView.webContents.send('ipc-browserview-create-quadtree');
        }
    });

    browserView.webContents.setWindowOpenHandler(({ url }) => {
        createBrowserviewInTab(url, properties);
    });
}

function removeMenusOverlay() {
    if (menusOverlay) {
        mainWindow.removeBrowserView(menusOverlay);
        menusOverlay.webContents.destroy();
        menusOverlay = null;
    }
}

function createMenuOverlay(overlayAreaToShow) {
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
                    preload: path.join(__dirname, '../src/renderer/overlays/render-overlay-menus.js'),
                }
            });

            //Attach the browser view to the parent window
            mainWindow.addBrowserView(menusOverlay);

            //Set its location/dimensions as per the returned properties
            menusOverlay.setBounds({
                x: Math.floor(properties.x),
                y: Math.floor(properties.y),
                width: Math.floor(properties.width),
                height: Math.floor(properties.height)
            });
            //Set auto resize
            menusOverlay.setAutoResize({
                width: true,
                height: true,
                horizontal: true,
                vertical: false
            });

            //Load the default home page
            menusOverlay.webContents.loadURL(path.join(__dirname, '../src/pages/overlays.html'));
            mainWindow.setTopBrowserView(menusOverlay)
            menusOverlay.webContents.send('ipc-main-overlays-loaded', overlayAreaToShow)
            if (isDevelopment) menusOverlay.webContents.openDevTools();
        })
}

// const iconPath = path.join(__dirname, 'logo.png')

// app.on('web-contents-created', (event, contents) => {
//   contents.on('will-attach-webview', (event, webPreferences, params) => {
//     webPreferences.nodeIntegration = false
//   })
// })

// ipcMain.on('ipc-mainwindow-scrolling-complete', () => {
//   browserView.webContents.send('ipc-browserview-create-quadtree');
// })

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
