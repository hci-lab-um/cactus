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
let mainWindowContent, overlayContent, isKeyboardOverlay
let webpageBounds = {}
let currentQt, currentNavAreaTree
let timeoutCursorHovering
let defaultUrl = config.get('browser.defaultUrl');
let tabList = [];
let bookmarks = [];
let isDwellingActive = true;

app.whenReady().then(() => {
    // This method is called when Electron has finished initializing
    createSplashWindow();
    // Show splash screen for a short while
    setTimeout(() => {
        createMainWindow();
    }, 2000);

    registerSwitchShortcutCommands();
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

// This creates a quadtree using serialisable HTML elements passed on from the renderer
ipcMain.on('ipc-tabview-generateQuadTree', (event, contents) => {
    var tab = tabList.find(tab => tab.isActive === true);
    // Recreate quadtree
    let bounds = tab.webContentsView.getBounds();
    //Taking zoom factor into account
    let adjustedWidth = bounds.width / tab.webContentsView.webContents.zoomFactor
    let adjustedHeight = bounds.height / tab.webContentsView.webContents.zoomFactor
    qtOptions = new QtBuilderOptions(adjustedWidth, adjustedHeight, 'new', 1);
    qtBuilder = new QuadtreeBuilder(qtOptions);

    const visibleElements = contents.serializedVisibleElements.map(e => {
        let htmlSerializableElement = new HTMLSerializableElement(e);
        return InteractiveElement.fromHTMLElement(htmlSerializableElement);
    });

    let pageDocument = new QtPageDocument(contents.docTitle, contents.docURL, visibleElements, adjustedWidth, adjustedHeight, null);

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

ipcMain.on('ipc-tabview-generateNavAreasTree', (event, contents) => {
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

ipcMain.on('ipc-tabview-cursor-mouseover', (event, mouseData) => {
    clearInterval(timeoutCursorHovering);

    timeoutCursorHovering = setInterval(() => {
        // New sidebar elements are only rendered if dwelling is active. This prevents the sidebar from being populated when the user has paused dwelling
        if (isDwellingActive) {
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
        }
    }, 500);
});

ipcMain.on('ipc-tabview-cursor-mouseout', (event) => {
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
    tab.webContentsView.webContents.send('ipc-tabview-scrolldown', configData);
});

ipcMain.on('ipc-mainwindow-scrollup', (event, configData) => {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-tabview-scrollup', configData);
});

ipcMain.on('ipc-mainwindow-click-sidebar-element', (event, elementToClick) => {
    var tab = tabList.find(tab => tab.isActive === true);
    //Once the main page is loaded, create inner tabview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
    tab.webContentsView.webContents.send('ipc-tabview-click-element', elementToClick);
})

ipcMain.on('ipc-mainwindow-highlight-elements-on-page', (event, elements) => {
    //Highlight elements on page
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-tabview-highlight-elements', elements);
});

ipcMain.on('ipc-mainwindow-show-overlay', async (event, overlayAreaToShow, elementProperties) => {
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

    // Right before the tabs overlay is shown, capture the snapshot of the active tab to get the current state of the page
    if (overlayAreaToShow === 'tabs') {
        try {
            await captureSnapshot();
        } catch (err) {
            log.error(err);
        }
    }
    
    createOverlay(overlayAreaToShow, elementProperties);
})

ipcMain.on('ipc-overlays-remove', (event) => {
    removeOverlay();
})

ipcMain.on('ipc-overlays-newTab', (event) => {
    removeOverlay();
    createTabview(defaultUrl, newTab = true);
})

ipcMain.on('ipc-overlays-tab-selected', (event, indexOfSelectedTab) => {
    // Set the selected tab as active and the rest as inactive
    tabList.forEach(tab => tab.isActive = false);
    const selectedTab = tabList[indexOfSelectedTab];
    selectedTab.isActive = true;

    // Moving the selected tab to the front by removing and re-adding the tabView to the main window child views
    mainWindow.contentView.removeChildView(selectedTab.webContentsView);
    mainWindow.contentView.addChildView(selectedTab.webContentsView);
    removeOverlay();
})

ipcMain.on('ipc-overlays-tab-deleted', (event, indexOfDeletedTab) => {
    // Removing the tabView from the main window child views
    deletedTabView = tabList[indexOfDeletedTab].webContentsView;
    mainWindow.contentView.removeChildView(deletedTabView);

    // Removing the tab from the tabList
    tabList.splice(indexOfDeletedTab, 1);

    // Updating the active tab
    tabList[tabList.length - 1].isActive = true;
})

ipcMain.on('ipc-bookmarks-updated', (event, updatedBookmarks) => {
    bookmarks = updatedBookmarks;
})

ipcMain.on('ipc-keyboard-input', (event, value, element) => {
    console.log("Keyboard value: ", value, element);
    // If the input is for the omnibox, send it to the main window, else send it to the active tab
    if (element.id === "url") { // "url" is the id of the omni box 
        mainWindowContent.webContents.send('ipc-mainwindow-keyboard-input', value);
    } else {
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-keyboard-input', value, element);
    }
    removeOverlay();
});

ipcMain.on('ipc-tabview-scroll-up-hide', () => {
    mainWindowContent.webContents.send('ipc-mainwindow-scroll-up-hide')
})

ipcMain.on('ipc-tabview-scroll-up-show', () => {
    mainWindowContent.webContents.send('ipc-mainwindow-scroll-up-show')
})

ipcMain.on('ipc-overlays-back', () => {
    //Select active tabview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-tabview-back');
})

ipcMain.on('ipc-overlays-forward', () => {
    //Select active tabview
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-tabview-forward');
})

ipcMain.on('ipc-overlays-settings', () => {
    createNewTab
});

ipcMain.on('ipc-overlays-toggle-dwell', () => {
    toggleDwelling();
});

ipcMain.on('ipc-overlays-zoom-in', () => {
    handleZoom("in");
});

ipcMain.on('ipc-overlays-zoom-out', () => {
    handleZoom("out");
});

ipcMain.on('ipc-overlays-zoom-reset', () => {
    handleZoom("reset");
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
            // if (isDevelopment) mainWindowContent.webContents.openDevTools(); to uncomment
            mainWindowContent.webContents.openDevTools(); // to remove

            //Once the main page is loaded, create inner tabview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
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
                    webpageBounds = {
                        x: Math.floor(properties.x),
                        y: Math.floor(properties.y),
                        width: Math.floor(properties.width),
                        height: Math.floor(properties.height)
                    }
                    createTabview(defaultUrl);
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
            mainWindowContent.webContents.openDevTools() // to remove
            // if (isDevelopment) mainWindowContent.webContents.openDevTools(); to uncomment
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
    if (overlayContent) overlayContent.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height });

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
            webpageBounds = {
                x: Math.floor(properties.x),
                y: Math.floor(properties.y),
                width: Math.floor(properties.width),
                height: Math.floor(properties.height)
            };

            // Update the bounds of all tabs
            tabList.forEach(tab => {
                tab.webContentsView.setBounds(webpageBounds);
            });
        })
        .catch(err => {
            log.error(err);
        });

}

function createTabview(url, newTab = false) {

    let scrollDistance = config.get('dwelling.tabViewScrollDistance');

    //Create browser view
    let tabView = new WebContentsView({
        //https://www.electronjs.org/docs/latest/tutorial/security
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../src/preload/tabview/preload-tabview.js'),
        }
    });

    //Set new tab as active (if any)
    tabList.forEach(tab => {
        tab.isActive = false
    });
    tabList.push({ tabId: tabList.length + 1, webContentsView: tabView, isActive: true });


    //Attach the browser view to the parent window
    mainWindow.contentView.addChildView(tabView);

    //Load the default home page
    tabView.webContents.loadURL(url);

    if (!newTab) {
        //Set its location/dimensions as per the webpage bounds
        tabView.setBounds(webpageBounds);
    } else {
        // tabView.setBounds({ 
        //     x: webpageBounds.x,
        //     y: webpageBounds.y + webpageBounds.height, // Starts below the visible area
        //     width: webpageBounds.width,
        //     height: webpageBounds.height
        // });
        // slideUpView(tabView);
        
        tabView.setBounds({ 
            x: webpageBounds.x  + webpageBounds.width, // Starts to the right of the visible area
            y: webpageBounds.y,
            width: webpageBounds.width,
            height: webpageBounds.height
        });
        slideInView(tabView);
    }

    //Once the DOM is ready, send a message to initiate some further logic
    tabView.webContents.on('dom-ready', () => {
        insertRendererCSS();

        const scriptToExecute = path.join(__dirname, '../src/renderer/tabview/render-tabview.js');
        const scriptContent = fs.readFileSync(scriptToExecute, 'utf-8');
        tabView.webContents.executeJavaScript(scriptContent).then(() => {
            // This event fires when the tabView is attached
            tabView.webContents.send('ipc-main-tabview-loaded', useNavAreas, scrollDistance);
        });

        tabView.webContents.openDevTools(); // to remove
        // if (isDevelopment) tabView.webContents.openDevTools(); to uncomment
    });

    //Loading event - update omnibox
    tabView.webContents.on('did-start-loading', () => {
        mainWindowContent.webContents.send('tabview-loading-start'); // Updates omnibox
    });

    tabView.webContents.on('did-stop-loading', () => {
        const url = tabView.webContents.getURL();
        const title = tabView.webContents.getTitle();
        mainWindowContent.webContents.send('tabview-loading-stop', { url: url, title: title }); // Updates omnibox
    });

    // When the page finished loading, a snapshot of the page is taken
    tabView.webContents.on('did-finish-load', () => {
        captureSnapshot();
    });

    //React to in-page navigation (e.g. anchor links)
    tabView.webContents.on('did-navigate-in-page', (event, url) => {
        const anchorTag = url.split('#')[1];
        if (anchorTag) {
            tabView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
        }
    });

    tabView.webContents.setWindowOpenHandler(({ url }) => {
        createTabview(url, newTab = true);
    });
}

function slideUpView(view, duration = 170) { 
    const fps = 120; // High frame rate for smoothness
    const interval = 1000 / fps;
    const steps = Math.ceil(duration / interval);

    // Starting position (below the visible area)
    const initialY = view.getBounds().y;
    const finalY = webpageBounds.y;

    const deltaY = (finalY - initialY) / steps;

    let currentY = initialY;
    let step = 0;

    const intervalId = setInterval(() => {
        step++;
        currentY += deltaY;

        view.setBounds({
            x: webpageBounds.x,  // Keeping x fixed
            y: currentY,         // Animating y only
            width: webpageBounds.width,
            height: webpageBounds.height,
        });

        if (step >= steps) {
            clearInterval(intervalId);
            view.setBounds(webpageBounds); // Ensure final bounds are set
        }
    }, interval);
}

function slideInView(view, duration = 200) { 
    const fps = 120; // High frame rate for smoothness
    const interval = 1000 / fps;
    const steps = Math.ceil(duration / interval);

    const initialX = view.getBounds().x;
    const finalX = webpageBounds.x;

    const deltaX = (finalX - initialX) / steps;

    let currentX = initialX;
    let step = 0;

    const intervalId = setInterval(() => {
        step++;
        currentX += deltaX;

        view.setBounds({
            x: currentX,
            y: webpageBounds.y,
            width: webpageBounds.width,
            height: webpageBounds.height
        });

        if (step >= steps) {
            clearInterval(intervalId);
            view.setBounds(webpageBounds); // Ensure final bounds are set
        }
    }, interval);
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
            
        .cactus-cursor {
            width: 50px;
            height: 50px;
            color: #a091eb;
            opacity: 0.4;
            z-index: 9999999999;
            position: absolute;
            margin: -20px 0 0 -20px;
            pointer-events: none;
        }

        /* Scrolling buttons */
        .cactus-scrollButton {
            position: absolute;
            margin: 14px;
            width: calc(100% - 28px);
            align-items: center;
            justify-content: center;
            padding: 10px;
            font-size: 20px;
            border-radius: 6px;
            background-color: #d7e3edbf;
            transition: all 0.5s ease 0s;
        }

        .cactus-scrollUp_outerDiv {
            position: sticky;
			top: 0px;
			width: 100%;
        }

        .cactus-scrollDown_outerDiv {
            position: sticky;
			bottom: 0px;
			width: 100%;
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

function captureSnapshot() {
    return new Promise((resolve, reject) => {
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.capturePage().then(snapshot => {
            tab.snapshot = snapshot.toDataURL();
            resolve();
        }).catch(err => {
            reject(err);
        });
    });
}

function removeOverlay() {
    if (overlayContent) {
        mainWindow.contentView.removeChildView(overlayContent);
        overlayContent = null;
        isKeyboardOverlay = null;
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
        isKeyboardOverlay = true;
        overlayContent.webContents.send('ipc-main-keyboard-loaded', elementProperties);
    } else if (overlayAreaToShow === 'tabs') {
        isKeyboardOverlay = false;

        // Extracting serializable properties from tabList
        const serializableTabList = tabList.map(tab => ({
            tabId: tab.tabId,
            isActive: tab.isActive,
            snapshot: tab.snapshot,
            title: tab.webContentsView.webContents.getTitle(), 
            url: tab.webContentsView.webContents.getURL(),
        }));
        let tabData = { tabList: serializableTabList, bookmarks };
        overlayContent.webContents.send('ipc-main-overlays-loaded', overlayAreaToShow, tabData);
    } else {
        isKeyboardOverlay = false;
        overlayContent.webContents.send('ipc-main-overlays-loaded', overlayAreaToShow, {});
    }
    // if (isDevelopment) overlayContent.webContents.openDevTools(); // to uncomment
    overlayContent.webContents.openDevTools(); // to remove
}

function registerSwitchShortcutCommands() {
    const shortcuts = config.get('shortcuts');

    let configData = {
        scrollDistance: config.get('dwelling.browserAreaScrollDistance'),
        useNavAreas: config.get('dwelling.activateNavAreas')
    };

    globalShortcut.register(shortcuts.click, () => {
        console.log("Clicking shortcut triggered");
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

        // Find the active tab in the tabList and check if the cursor is over it
        const activeTab = tabList.find(tab => tab.isActive);

        if (activeTab && isCursorWithinBounds(activeTab.webContentsView.getBounds())) {
            activeTab.webContentsView.webContents.send('ipc-trigger-click-under-cursor');
            console.log("Clicking on active tab");
            return;
        }

        // Check if the cursor is over the mainWindowContent
        if (isCursorWithinBounds(mainWindowContent.getBounds())) {
            mainWindowContent.webContents.send('ipc-trigger-click-under-cursor');
        }
    });

    globalShortcut.register(shortcuts.toggleOmniBox, () => {
        if (overlayContent && isKeyboardOverlay) {
            removeOverlay();
        } else {
            mainWindowContent.webContents.send('ipc-mainwindow-load-omnibox');
        }
    });

    globalShortcut.register(shortcuts.toggleDwelling, () => {
        toggleDwelling();
    });

    globalShortcut.register(shortcuts.zoomIn, () => {
        handleZoom("in", true);
    });

    globalShortcut.register(shortcuts.zoomOut, () => {
        handleZoom("out", true);
    });

    globalShortcut.register(shortcuts.tabScrollUp, () => {
        console.log("Tab Scroll up shortcut triggered");
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-scrollup', configData);
    });

    globalShortcut.register(shortcuts.tabScrollDown, () => {
        console.log("Tab Scroll down shortcut triggered");
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-scrolldown', configData);
    });

    globalShortcut.register(shortcuts.sidebarScrollUp, () => {
        mainWindowContent.webContents.send('ipc-main-sidebar-scrollup');
    });

    globalShortcut.register(shortcuts.sidebarScrollDown, () => {
        mainWindowContent.webContents.send('ipc-main-sidebar-scrolldown');
    });

    globalShortcut.register(shortcuts.navigateForward, () => {
        console.log("Navigate forward shortcut triggered");
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-forward');
    });

    globalShortcut.register(shortcuts.navigateBack, () => {
        console.log("Navigate back shortcut triggered");
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-back');
    });
}

function toggleDwelling() {
    isDwellingActive = !isDwellingActive
    mainWindowContent.webContents.send('ipc-mainwindow-handle-dwell-events', isDwellingActive);
    removeOverlay();    
}

function handleZoom(direction, usedShortcut = false) {
    const MIN_ZOOM_LEVEL = -7;
    const MAX_ZOOM_LEVEL = 7;

    const tab = tabList.find(tab => tab.isActive === true);
    let zoomLevel = tab.webContentsView.webContents.getZoomLevel();

    // When the shortcut is used to zoom in/out, then any time the zoom factor reaches the min/max value, it will reset to 1.0.
    // This creates a loop of zooming in/out when the user keeps pressing the shortcut.
    switch (direction) {
        case "in":
            zoomLevel = ((zoomLevel >= MAX_ZOOM_LEVEL) && usedShortcut) ? 0 : zoomLevel + 1;
            break;
        case "out":
            zoomLevel = ((zoomLevel <= MIN_ZOOM_LEVEL) && usedShortcut) ? 0 : zoomLevel - 1;
            break;
        case "reset":
            zoomLevel = 0;
            break;
    }

    tab.webContentsView.webContents.setZoomLevel(zoomLevel);
    tab.webContentsView.webContents.send('ipc-tabview-create-quadtree', useNavAreas); // Updating the quadtree after zooming
    if (!usedShortcut) removeOverlay();
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
//   tab.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
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
