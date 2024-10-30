const { app, BaseWindow, WebContentsView, ipcMain, globalShortcut, screen } = require('electron')
const config = require('config');
const path = require('path')
const fs = require('fs')
const { QuadtreeBuilder, InteractiveElement, HTMLSerializableElement, QtPageDocument, QtBuilderOptions, QtRange } = require('cactus-quadtree-builder');
const { MenuBuilder, NavArea, HTMLSerializableMenuElement, MenuPageDocument, MenuBuilderOptions, MenuRange } = require('cactus-menu-builder');
const { log } = require('electron-log');

const isDevelopment = process.env.NODE_ENV === "development";
const rangeWidth = config.get('dwelling.rangeWidth');
const rangeHeight = config.get('dwelling.rangeHeight');
const useNavAreas = config.get('dwelling.activateNavAreas');

let mainWindow, splashWindow
let mainWindowContent, overlayContent
let currentQt, currentNavAreaTree
let timeoutCursorHovering
let defaultUrl = config.get('browser.defaultUrl');
let tabList = [];

app.whenReady().then(() => {
    // This method is called when Electron has finished initializing
    createSplashWindow();
    // Show splash screen for a short while
    setTimeout(() => {
        createMainWindow();
    }, 2000);

    registerCommands();
});

app.on('window-all-closed', () => {
    // App closes when all windows are closed, however this is not default behaviour on macOS (applications and their menu bar to stay active)
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS re-create window when the dock icon is clicked (with no other windows open).
    if (BaseWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
})

ipcMain.handle('get-tab-renderer-script', async () => {
    try {
        const scriptToExecute = path.join(__dirname, '../src/renderer/browserview/render-tabview.js');
        const scriptContent = await fs.readFileSync(scriptToExecute, 'utf-8');
        return scriptContent;
    }
    catch (ex) {
        console.log(ex);
    }
})
let count_generateQuadTree = 0;
// This creates a quadtree using serialisable HTML elements passed on from the renderer
ipcMain.on('ipc-browserview-generateQuadTree', (event, contents) => {
    count_generateQuadTree++;
    console.log("Generate Quad Tree Counter:", count_generateQuadTree);

    var tab = tabList.find(tab => tab.isActive === true);
    // Recreate quadtree
    let bounds = tab.webContentsView.getBounds();
    qtOptions = new QtBuilderOptions(bounds.width, bounds.height, 'new', 1);
    qtBuilder = new QuadtreeBuilder(qtOptions);

    const visibleElements = contents.serializedVisibleElements.map(e => {
        let htmlSerializableElement = new HTMLSerializableElement(e);
        return InteractiveElement.fromHTMLElement(htmlSerializableElement);
    });

    let pageDocument = new QtPageDocument(contents.docTitle, contents.docURL, visibleElements, bounds.width, bounds.height, null);

    qtBuilder.buildAsync(pageDocument).then((qt) => {
		currentQt = qt;

        //Only in debug mode - show which points are available for interaction
		if (isDevelopment) {
            const viewRange = new QtRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
			const elementsInView = qt.queryRange(viewRange);
            
            contents = { 
                elementsInView: elementsInView, 
                rangeWidth: rangeWidth, 
                rangeHeight: rangeHeight,
                color: '#702963'
            }; 

            tab.webContentsView.webContents.send('ipc-clear-highlighted-elements');
            tab.webContentsView.webContents.send('ipc-highlight-available-elements', contents);
		}
	});
});

ipcMain.on('ipc-browserview-generateNavAreasTree', (event, contents) => {
    //Recreate quadtree    
    var tab = tabList.find(tab => tab.isActive === true);
    let bounds = tab.webContentsView.getBounds();
	let menuBuilderOptions = new MenuBuilderOptions(bounds.width, bounds.height, 'new');
	let menuBuilder = new MenuBuilder(menuBuilderOptions);

    const visibleElements = contents.serializedVisibleMenus.map(e => {
        let htmlSerializableMenuElement = createHTMLSerializableMenuElement(e);
        return NavArea.fromHTMLElement(htmlSerializableMenuElement);
    });

    let pageDocument = new MenuPageDocument(contents.docTitle, contents.docURL, visibleElements, bounds.width, bounds.height, null);

    menuBuilder.buildAsync(pageDocument).then((hierarchicalAreas) => {
		currentNavAreaTree = hierarchicalAreas;

		//Only in debug mode - show which points are available for interaction
		if (isDevelopment) {
			const viewRange = new MenuRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
			const elementsInView = currentNavAreaTree.queryRange(viewRange, true);
            
            contents = { 
                elementsInView: elementsInView, 
                rangeWidth: rangeWidth, 
                rangeHeight: rangeHeight,
                color: '#E34234'
            }; 

            tab.webContentsView.webContents.send('ipc-highlight-available-elements', contents);
		}
	});
});

ipcMain.on('ipc-browserview-cursor-mouseover', (event, mouseData) => {
    clearInterval(timeoutCursorHovering);

    timeoutCursorHovering = setInterval(() => {
        const { x, y } = mouseData;

        const qtRangeToQuery = new QtRange(x - (rangeWidth / 2), y - (rangeHeight / 2), rangeWidth, rangeHeight);
        const menuRangeToQuery = new MenuRange(x - (rangeWidth / 2), y - (rangeHeight / 2), rangeWidth, rangeHeight);

        const elementsInQueryRange = currentQt ? currentQt.queryRange(qtRangeToQuery) : [];
        const navAreasInQueryRange = useNavAreas ? (currentNavAreaTree ? currentNavAreaTree.queryRange(menuRangeToQuery, true) : []) : [];

        if (useNavAreas && navAreasInQueryRange.length > 0) {
            mainWindowContent.webContents.send('ipc-mainwindow-sidebar-render-navareas', navAreasInQueryRange)
            clearInterval(timeoutCursorHovering);
        } else {
            const uniqueInteractiveElementsInQueryRange = [];
            const seenElements = new Set();
            elementsInQueryRange.forEach(el => {
                if (!seenElements.has(el.id)) {
                    seenElements.add(el.id);
                    uniqueInteractiveElementsInQueryRange.push(el);
                }
            });
            mainWindowContent.webContents.send('ipc-mainwindow-sidebar-render-elements', uniqueInteractiveElementsInQueryRange)
        }
    }, 500);
});

ipcMain.on('ipc-browserview-cursor-mouseout', (event) => {
    clearInterval(timeoutCursorHovering);
});

ipcMain.on('browse-to-url', (event, url) => {
    if (url) {
        //Assume all is ok
        let fullUrl = url;
        var tab = tabList.find(tab => tab.isActive === true);
        const currentURL = new URL(tab.webContentsView.webContents.getURL());
        const protocol = currentURL.protocol;
        const host = currentURL.host;

        //Handle URLs without protocol (e.g. //www.google.com)
        if (url.startsWith('//')) {
            fullUrl = protocol + url;
        } else {
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

        tab.webContentsView.webContents.loadURL(fullUrl);
    }
});

ipcMain.on('ipc-mainwindow-scrolldown', (event, configData) => {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-browserview-scrolldown', configData);
});

ipcMain.on('ipc-mainwindow-scrollup', (event, configData) => {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-browserview-scrollup', configData);
});

ipcMain.on('ipc-mainwindow-click-sidebar-element', (event, elementToClick) => {
    var tab = tabList.find(tab => tab.isActive === true);
    //Once the main page is loaded, create inner browserview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
    tab.webContentsView.webContents.send('ipc-browserview-click-element', elementToClick);
})

ipcMain.on('ipc-mainwindow-highlight-elements-on-page', (event, elements) => {
    //Highlight elements on page
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-browserview-highlight-elements', elements);
});

ipcMain.on('ipc-mainwindow-show-overlay', (event, overlayAreaToShow, elementProperties) => {
    if (elementProperties) {
        // If the element is the omnibox, get the current active tab's url and set it as the value
        if (elementProperties.id === "url") {
            let pageURL = tabList.find(tab => tab.isActive === true).webContentsView.webContents.getURL();
            // if the url contains a / at the end, it is removed (This is a temporary workaround for the search function that checks for TLDs)
            if (pageURL[pageURL.length - 1] === '/') {
                pageURL = pageURL.slice(0, -1);
            }
            elementProperties.value = pageURL;
        }
    }

    createOverlay(overlayAreaToShow, elementProperties);
})

ipcMain.on('ipc-overlays-remove', (event) => {
    removeOverlay();
})

ipcMain.on('ipc-keyboard-input', (event, value, element) => {
    console.log("Keyboard value: ", value, element);
    // If the input is for the omnibox, send it to the main window, else send it to the active tab
    if (element.id === "url") { // "url" is the id of the omni box 
        mainWindowContent.webContents.send('ipc-mainwindow-keyboard-input', value);
    } else {
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-browserview-keyboard-input', value, element);
    }
    removeOverlay();
});

ipcMain.on('ipc-browserview-scroll-up-hide', () => {
    mainWindowContent.webContents.send('ipc-mainwindow-scroll-up-hide')
})

ipcMain.on('ipc-browserview-scroll-up-show', () => {
    mainWindowContent.webContents.send('ipc-mainwindow-scroll-up-show')
})

ipcMain.on('ipc-overlays-back', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-browserview-back');
})

ipcMain.on('ipc-overlays-forward', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-browserview-forward');
})

ipcMain.on('ipc-overlays-zoom-in', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    var zoomLevel = tab.webContentsView.webContents.getZoomLevel();
    tab.webContentsView.webContents.setZoomLevel(zoomLevel + 1);
    removeOverlay();
})

ipcMain.on('ipc-overlays-zoom-out', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    var zoomLevel = tab.webContentsView.webContents.getZoomLevel();
    tab.webContentsView.webContents.setZoomLevel(zoomLevel - 1);
    removeOverlay();
})

ipcMain.on('ipc-overlays-zoom-reset', () => {
    //Select active browserview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.setZoomLevel(0);
    removeOverlay();
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
        mainWindow = new BaseWindow({
            frame: true,
            title: "Cactus"
        });
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
        mainWindowContent.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height })

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

        //Handle resize and maxmised events
        mainWindow.on('resized', () => {
            resizeMainWindow();

        });
        mainWindow.on('maximize', () => {
            resizeMainWindow();
        });

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

function resizeMainWindow() {
    mainWindowContent.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height })
    overlayContent.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height });

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
            // Update the bounds of all tabs
            tabList.forEach(tab => {
                tab.webContentsView.setBounds({
                    x: Math.floor(properties.x),
                    y: Math.floor(properties.y),
                    width: Math.floor(properties.width),
                    height: Math.floor(properties.height)
                });
            });
        })
        .catch(err => {
            log.error(err);
        });

}

function createBrowserviewInTab(url, properties) {
    //Create browser view
    let browserView = new WebContentsView({
        //https://www.electronjs.org/docs/latest/tutorial/security
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../src/preload/browserview/preload-browserview.js'),
        }
    });

    //Set new tab as active (if any)
    tabList.forEach(tab => {
        tab.isActive = false
    });
    tabList.push({ tabId: tabList.length + 1, webContentsView: browserView, isActive: true });


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
        browserView.webContents.send('ipc-main-browserview-loaded', useNavAreas);
        insertRendererCSS();

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
            browserView.webContents.send('ipc-browserview-create-quadtree', useNavAreas);
        }
    });

    browserView.webContents.setWindowOpenHandler(({ url }) => {
        createBrowserviewInTab(url, properties);
    });
}

function insertRendererCSS() {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.insertCSS(`
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
}

function removeOverlay() {
    if (overlayContent) {
        mainWindow.contentView.removeChildView(overlayContent);
        overlayContent = null;
    }
}

function createOverlay(overlayAreaToShow, elementProperties) {
    removeOverlay();

    let mainWindowContentBounds = mainWindow.getContentBounds();
    let renderer = overlayAreaToShow === 'keyboard' ? 'render-overlay-keyboard.js' : 'render-overlay-menus.js';
    let htmlPage = overlayAreaToShow === 'keyboard' ? 'keyboard.html' : 'overlays.html';

    overlayContent = new WebContentsView({
        //https://www.electronjs.org/docs/latest/tutorial/security
        webPreferences: {
            nodeIntegrationInWorker: true,
            contextIsolation: true,
            preload: path.join(__dirname, '../src/renderer/overlays/', renderer),
        }
    })
    
    mainWindow.contentView.addChildView(overlayContent)
    overlayContent.setBounds({ x: 0, y: 0, width: mainWindowContentBounds.width, height: mainWindowContentBounds.height })
    overlayContent.webContents.loadURL(path.join(__dirname, '../src/pages/', htmlPage));

    if (overlayAreaToShow === 'keyboard') {
        console.log("creating keyboard overlay");
        overlayContent.webContents.send('ipc-main-keyboard-loaded', elementProperties);
    } else {
        console.log("creating menus overlay");
        overlayContent.webContents.send('ipc-main-overlays-loaded', overlayAreaToShow)
    }
    if (isDevelopment) overlayContent.webContents.openDevTools();
}

function registerCommands() {
    globalShortcut.register('CommandOrControl+Alt+C', () => {
        console.log('CommandOrControl+Alt+C is pressed');
        const cursorPosition = screen.getCursorScreenPoint();
    
        // Function to check if the cursor is within the bounds of a view
        const isCursorWithinBounds = (bounds) => {
            return (
                cursorPosition.x >= bounds.x &&
                cursorPosition.x <= bounds.x + bounds.width &&
                cursorPosition.y >= bounds.y &&
                cursorPosition.y <= bounds.y + bounds.height
            );
        };
    
        // Check if there is an overlay and if the cursor is over it
        if (overlayContent && isCursorWithinBounds(overlayContent.getBounds())) {
            overlayContent.webContents.send('ipc-trigger-click-under-cursor');
            return;
        }
    
        // Find the active tab in the tabList
        const activeTab = tabList.find(tab => tab.isActive);
    
        if (activeTab && isCursorWithinBounds(activeTab.webContentsView.getBounds())) {
            activeTab.webContentsView.webContents.send('ipc-trigger-click-under-cursor');
            return;
        }
    
        // Check if the cursor is over the mainWindowContent
        if (isCursorWithinBounds(mainWindowContent.getBounds())) {
            mainWindowContent.webContents.send('ipc-trigger-click-under-cursor');
        }
    });
}

function createHTMLSerializableMenuElement(element) {
    // Mapping each child element to a serializable menu element
    element.children = element.children.map(child => createHTMLSerializableMenuElement(child));
    return new HTMLSerializableMenuElement(element);
}

// const iconPath = path.join(__dirname, 'logo.png')

// app.on('web-contents-created', (event, contents) => {
//   contents.on('will-attach-webview', (event, webPreferences, params) => {
//     webPreferences.nodeIntegration = false
//   })
// })

// ipcMain.on('ipc-mainwindow-scrolling-complete', () => {
//   var tab = tabList.find(tab => tab.isActive === true);
//   tab.webContents.send('ipc-browserview-create-quadtree', useNavAreas);
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
