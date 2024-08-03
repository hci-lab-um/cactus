const { app, BaseWindow, WebContentsView, ipcMain } = require('electron')
const config = require('config');
const path = require('path')
const { log } = require('electron-log');

const isDevelopment = process.env.NODE_ENV === "development";

let mainWindow, splashWindow, menusOverlayWindow
let mainWindowContent
let defaultUrl = config.get('browser.defaultUrl');
let tabList = [];

app.whenReady().then(() => {
    // This method is called when Electron has finished initializing
    createSplashWindow();
    // Show splash screen for a short while
    setTimeout(() => {
        createMainWindow();
    }, 2000);
});

app.on('window-all-closed', () => {
    // App closes when all windows are closed, however this is not default behaviour on macOS (applications and their menu bar to stay active)
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS re-create window when the dock icon is clicked (with no other windows open).
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
})

ipcMain.on('browse-to-url', (event, url) => {
    if (url) {
        //Assume all is ok
        let fullUrl = url;
        var tab = tabList.find(tab => tab.isActive === true);
        const currentURL = new URL(tab.browserView.webContents.getURL());
        const protocol = currentURL.protocol;
        const host = currentURL.host;

        //Handle URLs without protocol (e.g. //www.google.com)
        if (url.startsWith('//')) {
            fullUrl = protocol + url;
        }
        else {
            //Handle relative path URLs (e.g. /path/to/resource)
            if (url.startsWith('/')) {
                fullUrl = protocol + '//' + host + url;
            }
            else {
                //Handle anchors (e.g. #element-id)
                if (url.startsWith('#')) {
                    let currentAnchorPos = currentURL.href.indexOf('#');
                    if (currentAnchorPos > 0) {
                        fullUrl = currentURL.href.substring(0, currentAnchorPos) + url;
                    } else {
                        fullUrl = currentURL.href + url;
                    }
                }
                else {
                    //Take as is
                    fullUrl = url;
                }
            }
        }

        tab.browserView.webContents.loadURL(fullUrl);
    }
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
    //Render in sidebar
    mainWindowContent.webContents.send('ipc-mainwindow-sidebar-render-elements', elements)
})

ipcMain.on('ipc-browserview-navareas-in-mouserange', (event, navareas) => {
    mainWindowContent.webContents.send('ipc-mainwindow-sidebar-render-navareas', navareas)
})

ipcMain.on('ipc-mainwindow-highlight-elements-on-page', (event, elements) => {
    //Highlight elements on page
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.send('ipc-browserview-highlight-elements', elements);
});

ipcMain.on('ipc-mainwindow-show-overlay', (event, overlayAreaToShow) => {
    createMenuOverlay(overlayAreaToShow);
})

ipcMain.on('ipc-overlays-remove', () => {
    removeMenusOverlay();
})

ipcMain.on('ipc-browserview-scroll-up-hide', () => {
    mainWindowContent.webContents.send('ipc-mainwindow-scroll-up-hide')
})

ipcMain.on('ipc-browserview-scroll-up-show', () => {
    mainWindowContent.webContents.send('ipc-mainwindow-scroll-up-show')
})

ipcMain.on('ipc-overlays-back', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.send('ipc-browserview-back');
})

ipcMain.on('ipc-overlays-forward', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.browserView.webContents.send('ipc-browserview-forward');
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

    splashWindow = new BaseWindow({
        width: 500,
        height: 503,
        transparent: true,
        frame: false,
        alwaysOnTop: true
    });

    // Load the splash screen HTML file
    const splashWindowContent = new WebContentsView()
    splashWindow.contentView.addChildView(splashWindowContent)
    splashWindowContent.setBounds({ x: 0, y: 0, width: splashWindow.getBounds().width, height: splashWindow.getBounds().height })
    splashWindowContent.webContents.loadURL(path.join(__dirname, '../src/pages/splash.html'));

}

function createMainWindow() {
    try {
        mainWindow = new BaseWindow();
        mainWindowContent = new WebContentsView({
            //https://www.electronjs.org/docs/latest/tutorial/security
            webPreferences: {
                nodeIntegrationInWorker: true,
                contextIsolation: true,
                preload: path.join(__dirname, '../src/renderer/mainwindow/render-mainwindow.js')
            },
            icon: path.join(__dirname + '../../resources/logo.png'),
            show: false //until loaded
        })

        mainWindow.contentView.addChildView(mainWindowContent)
        mainWindow.maximize();
        mainWindowContent.setBounds({ x: 0, y: 0, width: mainWindow.getBounds().width, height: mainWindow.getBounds().height })

        mainWindowContent.webContents.loadURL(path.join(__dirname, '../src/pages/index.html')).then(() => {
            mainWindowContent.webContents.send('mainWindowLoaded');
            if (isDevelopment) mainWindowContent.webContents.openDevTools();

            //Once the main page is loaded, create inner browserview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
            mainWindowContent.webContents.executeJavaScript(`
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
            if (isDevelopment) mainWindowContent.webContents.openDevTools()
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
    let browserView = new WebContentsView({
        //https://www.electronjs.org/docs/latest/tutorial/security
        webPreferences: {
            nodeIntegrationInWorker: true,
            contextIsolation: true,
            preload: path.join(__dirname, '../src/renderer/browserview/render-browserview.js'),
        }
    });

    //Set new tab as active (if any)
    tabList.forEach(tab => {
        tab.isActive = false
    });
    tabList.push({ tabId: tabList.length + 1, browserView: browserView, isActive: true });


    //Attach the browser view to the parent window
    mainWindow.contentView.addChildView(browserView);

    //Set its location/dimensions as per the returned properties
    browserView.setBounds({
        x: Math.floor(properties.x),
        y: Math.floor(properties.y),
        width: Math.floor(properties.width),
        height: Math.floor(properties.height)
    });

    //Load the default home page
    browserView.webContents.loadURL(url);
    //mainWindow.setTopBrowserView(browserView)

    //Once the DOM is ready, send a message to initiate some further logic
    browserView.webContents.on('dom-ready', () => {
        // This event fires when the BrowserView is attached
        browserView.webContents.send('ipc-main-browserview-loaded');
        browserView.webContents.insertCSS(`
        html, body { overflow-x: hidden; } 
        
        /* IMP: user-select:none and pointer-events:none rules removed in different selectors */

        a, input, textarea, button, div { 
            cursor: none !important; 
        }
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

        /* Quadtree markers */
        .cactusElementMark {
            position: relative;
            // background-color: transparent;
        }

        .cactusElementVisualise {
            border-radius: 5px;
            border: 1px solid #10468b;
            transition: background-color 0.5s ease;
            background-color: #e6f1fa !important;
            //color: #e6f1fa !important;
            //border-radius: 5px;
        }

        .cactusElementVisualiseRemoved {
        }

        .cactusNavMarker {
            color: inherit;

            &:after {
                content: '';
                position: absolute;
                bottom: 100%;
                left: 0;
                width: 0%;
                height: 3px;
                display: block;
                background: #03644f !important;
                transition: 1.5s ease-in-out;
            }
        }

        .cactusNavMarker:hover {
            color: #2d3d4d;
            background-color: lighten(#03644f, 50%) !important;

            &:after {
                width: 100%;
            }
        }
        `);
        if (isDevelopment) browserView.webContents.openDevTools();
    });

    //Loading event - update omnibox
    browserView.webContents.on('did-start-loading', () => {
        mainWindowContent.webContents.send('browserview-loading-start');
    });

    browserView.webContents.on('did-stop-loading', () => {
        const url = browserView.webContents.getURL();
        const title = browserView.webContents.getTitle();
        mainWindowContent.webContents.send('browserview-loading-stop', { url: url, title: title });
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
    if (menusOverlayWindow) {
        menusOverlayWindow.close();
        menusOverlayWindow = null;
    }
}

function createMenuOverlay(overlayAreaToShow) {
    removeMenusOverlay();

    let mainWindowBounds = mainWindow.getBounds();

    menusOverlayWindow = new BaseWindow({
        parent: mainWindow,
        width: mainWindowBounds.width,
        height: mainWindowBounds.height,
        x: mainWindowBounds.x,
        y: mainWindowBounds.y,
        transparent: true,
        frame: false,
        alwaysOnTop: true
    });

    // Load the splash screen HTML file
    const menusOverlayContent = new WebContentsView({
        //https://www.electronjs.org/docs/latest/tutorial/security
        webPreferences: {
            nodeIntegrationInWorker: true,
            contextIsolation: true,
            preload: path.join(__dirname, '../src/renderer/overlays/render-overlay-menus.js'),
        }
    })
    menusOverlayWindow.contentView.addChildView(menusOverlayContent)

    menusOverlayContent.setBounds({ x: 0, y: 0, width: mainWindowBounds.width, height: mainWindowBounds.height })
    menusOverlayContent.webContents.loadURL(path.join(__dirname, '../src/pages/overlays.html'));

    menusOverlayContent.webContents.send('ipc-main-overlays-loaded', overlayAreaToShow)
    if (isDevelopment) menusOverlayContent.webContents.openDevTools();
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
//   mainWindowContent.webContents.send('getLinks', message)
// })

// ipcMain.on('getNavLinks', (event, message) => {
//   mainWindowContent.webContents.send('getNavLinks', message)
// })

// ipcMain.on('loadBookmark', (event, message) => {
//   mainWindowContent.webContents.send('loadBookmark', message)
// })

// ipcMain.on('closeBookmarks', (event, message) => {
//   mainWindowContent.webContents.send('closeBookmarks', message)
// })
