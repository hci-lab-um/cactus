const { app, BaseWindow, WebContentsView, ipcMain, globalShortcut, screen, session } = require('electron')
const config = require('config');
const path = require('path')
const fs = require('fs')
const { QuadtreeBuilder, InteractiveElement, HTMLSerializableElement, QtPageDocument, QtBuilderOptions, QtRange } = require('cactus-quadtree-builder');
const { MenuBuilder, NavArea, HTMLSerializableMenuElement, MenuPageDocument, MenuBuilderOptions, MenuRange } = require('cactus-menu-builder');
const { log } = require('electron-log');
const robot = require("robotjs_addon");
const db = require('../database/database.js');
const { Settings } = require('../src/tools/enums.js');

const isDevelopment = process.env.NODE_ENV === "development";
let rangeWidth;
let rangeHeight;
let useNavAreas;
let useRobotJS;
let defaultUrl;
let scrollDistance;
let menuAreaScrollDistance;
let menuAreaScrollInterval;
let dwellTime;

let mainWindow, splashWindow
let mainWindowContent, overlayContent, isKeyboardOverlay
let webpageBounds = {}
let currentQt, currentNavAreaTree
let timeoutCursorHovering
let tabList = [];
let tabsFromDatabase = [];
let bookmarks = [];
let isDwellingActive = true;


// =================================
// ====== APP EVENT LISTENERS ======
// =================================

app.whenReady().then(async () => {
    try {
        await db.connect();
        await db.createTables();
        await initialiseVariables();
    } catch (err) {
        console.error('Error initializing database:', err.message);
    }

    // This method is called when Electron has finished initializing
    createSplashWindow();
    // Show splash screen for a short while
    setTimeout(() => {
        createMainWindow();
    }, 2000);

    registerSwitchShortcutCommands();
});

app.on('window-all-closed', async() => {
    await deleteAndInsertAllTabs();

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


// =================================
// ======= IPC COMMUNICATION =======
// =================================

ipcMain.handle('tabview-can-go-back-or-forward', (event) => {
    // Check if the active tab can go back or forward
    var tab = tabList.find(tab => tab.isActive === true);
    var canGoBack = tab.webContentsView.webContents.canGoBack();
    var canGoForward = tab.webContentsView.webContents.canGoForward();
    if (canGoBack || canGoForward) return true;
});

ipcMain.handle('ipc-get-user-setting', async (event, setting) => {
    switch (setting) {
        case Settings.DWELL_TIME:
            return dwellTime;
        case Settings.KEYBOARD_DWELL_TIME:
            return await db.getKeyboardDwellTime();
        case Settings.MENU_AREA_SCROLL_DISTANCE:
            return menuAreaScrollDistance;
        case Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS:
            return menuAreaScrollInterval;
        case Settings.TAB_VIEW_SCROLL_DISTANCE:
            return scrollDistance;
        case Settings.RANGE_WIDTH:
            return rangeWidth;
        case Settings.RANGE_HEIGHT:
            return rangeHeight;
        case Settings.ACTIVATE_NAV_AREAS:
            return useNavAreas;
        default:
            throw new Error(`Unknown setting: ${setting}`);
    }
});

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

            //If navAreas is enabled, check if the nav root has anything in it.
            let hasRootNav = (navAreasInQueryRange[0]?.navItems[0] != null) ? true : false;

            let tab = tabList.find(tab => tab.isActive === true);
            let tabURL = tab.webContentsView.webContents.getURL();

            if (useNavAreas && hasRootNav) {
                mainWindowContent.webContents.send('ipc-mainwindow-sidebar-render-navareas', navAreasInQueryRange, tabURL)
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
                mainWindowContent.webContents.send('ipc-mainwindow-sidebar-render-elements', uniqueInteractiveElementsInQueryRange, tabURL)
            }
        }
    }, 500);
});

ipcMain.on('ipc-tabview-cursor-mouseout', (event) => {
    clearInterval(timeoutCursorHovering);
});

ipcMain.on('browse-to-url', (event, url) => {
    const fullUrl = getFullURL(url);
    let tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.loadURL(fullUrl);
});

ipcMain.on('robot-mouse-click', async (event, { x, y }) => {
    /**
     * This may not work properly if the window is moved to a different sized monitor that 
     * extends the other one, after the initial load. Resizing of the window on the same 
     * monitor works fine.
     */

    const win = BaseWindow.getFocusedWindow();
    const bounds = win.getBounds();
    const contentBounds = win.getContentBounds();
    const display = screen.getDisplayMatching(bounds);
    const scaleFactor = display.scaleFactor;

    // Correct for frame offset
    const frameOffsetX = contentBounds.x - bounds.x;
    const frameOffsetY = contentBounds.y - bounds.y;

    // Get global screen coordinates of window
    const windowScreenX = bounds.x + frameOffsetX;
    const windowScreenY = bounds.y + frameOffsetY;

    // Get the webpage's position within the window
    const tabX = windowScreenX + webpageBounds.x;
    const tabY = windowScreenY + webpageBounds.y;

    // Get the active tab and its zoom factor
    const tab = tabList.find(tab => tab.isActive === true);
    const zoomFactor = await tab.webContentsView.webContents.getZoomFactor();

    // Get the element's position within the tab
    const elementX = tabX + (x * zoomFactor);
    const elementY = tabY + (y * zoomFactor);

    // Convert to physical pixels if needed
    const finalX = elementX * scaleFactor;
    const finalY = elementY * scaleFactor;

    console.log(`Final Element Position: (${finalX}, ${finalY})`);

    // Move mouse to the top-left corner of the window
    robot.moveMouse(finalX, finalY);
    robot.mouseClick();
});

ipcMain.on('robot-keyboard-type', (event, { text, submit }) => {
    /**
     * For inserting text, robot.typeString() is faster than robot.keyTap(), but robot.typeString()
     * tends to omit consecutive characters in the text. Therefore, when the text has consecutive
     * characters, we use robot.keyTap() to type each character individually. However, robot.keyTap()
     * is slower than robot.typeString(). To improve performance, we split the text into words and
     * if it does not have consecutive characters, we type it using robot.typeString(). If the
     * word has consecutive characters, we type each of its characters using robot.keyTap().
     */

    const consecutiveCharPattern = /(.)\1+/;
    const hasConsecutiveChars = consecutiveCharPattern.test(text);

    // Wait a short period to ensure the field is focused before performing actions
    robot.setKeyboardDelay(50);

    // Select all text (Ctrl + A or Cmd + A). On Windows/Linux 'control', on macOS 'command'
    if (process.platform == 'darwin')
        robot.keyTap("a", ["command"]);
    else
        robot.keyTap("a", ["control"]);

    //Deleting the selected text
    robot.keyTap("backspace");

    // If the text does not have consecutive characters, type the whole text using typeString
    if (!hasConsecutiveChars) {
        robot.typeString(text);
    } else {
        // Split the text into an array of words
        const wordArray = text.split(" ");
        // Iterate through each word
        wordArray.forEach((word, index) => {
            if (consecutiveCharPattern.test(word)) {
            // If the word has consecutive characters, type each character using keyTap
            for (let char of word) {
                robot.keyTap(char);
            }
            } else {
            // If the word does not have consecutive characters, type the whole word using typeString
            robot.typeString(word);
            }
            // Add a space after each word except the last one
            if (index < wordArray.length - 1) {
            robot.keyTap("space");
            }
        });
    }

    if (submit) {
        // Delay is added to ensure the text is typed before pressing enter
        setTimeout(() => {
            robot.keyTap("enter");
        }, 500);
    }
})

ipcMain.on('robot-keyboard-enter', (event) => {
    // Wait a short period to ensure the field is focused before performing actions
    setTimeout(() => {
        robot.keyTap("enter");
    }, 500);
})

ipcMain.on('robot-keyboard-spacebar', (event) => {
    // Wait a short period to ensure the field is focused before performing actions
    robot.setKeyboardDelay(300);
    robot.keyTap("space");
})

ipcMain.on('robot-keyboard-backspace', (event) => {
    // Wait a short period to ensure the field is focused before performing actions
    // robot.setKeyboardDelay(300);
    robot.keyTap("backspace");
})

ipcMain.on('robot-keyboard-numpad', (event, number) => {
    // Wait a short period to ensure the field is focused before performing actions
    // robot.setKeyboardDelay(50);
    robot.typeString(number);
})

ipcMain.on('robot-keyboard-arrow-key', (event, direction) => {
    if (direction === "up") {
        robot.keyTap("up");
    } else if (direction === "down") {
        robot.keyTap("down");
    } else if (direction === "left") {
        robot.keyTap("left");
    } else if (direction === "right") {
        robot.keyTap("right");
    } else if (direction === "home") {
        robot.keyTap("home");
    } else if (direction === "end") {
        robot.keyTap("end");
    }
})

ipcMain.on('ipc-mainwindow-click-sidebar-element', (event, elementToClick) => {
    var tab = tabList.find(tab => tab.isActive === true);
    //Focus on window first before going forward
    tab.webContentsView.webContents.focus();
    //Once the main page is loaded, create inner tabview and place it in the right position by getting the x,y,width,height of a positioned element in index.html
    tab.webContentsView.webContents.send('ipc-tabview-click-element', elementToClick, useRobotJS);
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
            let activeTab = tabList.find(tab => tab.isActive === true);
            let pageURL = activeTab.webContentsView.webContents.getURL();
            // if the page is an error page, get the original URL that caused the error
            if (activeTab.isErrorPage && activeTab.originalURL) {
                pageURL = activeTab.originalURL;
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

// This event is triggered when the user clicks on the bookmark icon in the main window to add a bookmark
ipcMain.on('ipc-mainwindow-add-bookmark', async (event) => {
    // Capturing the current state of the page before bookmarking
    try {
        await captureSnapshot();
    } catch (err) {
        log.error(err);
    }

    // Getting the active tab's URL and title
    let tab = tabList.find(tab => tab.isActive === true);
    let url = tab.webContentsView.webContents.getURL();
    let title = tab.webContentsView.webContents.getTitle();
    let snapshot = tab.snapshot;

    var bookmark = { title: title, url: url, snapshot: snapshot };
    bookmarks.push(bookmark);

    addBookmarkToDatabase(bookmark);
});

// This event is triggered when the user clicks on the bookmark icon in the main window to remove a bookmark
ipcMain.on('ipc-mainwindow-remove-bookmark', async (event) => {
    let tab = tabList.find(tab => tab.isActive === true);
    let activeURL = tab.webContentsView.webContents.getURL();

    bookmarks = bookmarks.filter(bookmark => bookmark.url !== activeURL);
    deleteBookmarkByUrl(activeURL);
});

ipcMain.on('ipc-mainwindow-open-iframe', (event, src) => {
    if (src) {
        createTabview(getFullURL(src), newTab = true);
    }
})

ipcMain.on('ipc-overlays-remove', (event) => {
    removeOverlay();
})

ipcMain.on('ipc-overlays-remove-and-update', (event) => {
    let newActiveTab = tabList.find(tab => tab.isActive === true);
    updateOmnibox();
    updateBookmarksIcon();
    clearSidebarAndUpdateQuadTree();
    removeOverlay();
    setTabViewEventlistenersAndLoadURL(newActiveTab);

    // In case the active tab has been updated, reconnect the mutation observer of the newly active tab
    newActiveTab.webContentsView.webContents.send('ipc-main-reconnect-mutation-observer');
})

// TABS OVERLAY
ipcMain.on('ipc-overlays-newTab', (event) => {
    // Before updating the active tab, disconnect the mutation observer of the previous active tab
    let previousActiveTab = tabList.find(tab => tab.isActive === true);
    previousActiveTab.webContentsView.webContents.send('ipc-main-disconnect-mutation-observer');

    removeOverlay();
    createTabview(defaultUrl, newTab = true);
    clearSidebarAndUpdateQuadTree();
})

ipcMain.on('ipc-overlays-tab-selected', (event, tabId) => {
    // Before updating the active tab, disconnect the mutation observer of the previous active tab
    let previousActiveTab = tabList.find(tab => tab.isActive === true);
    previousActiveTab.webContentsView.webContents.send('ipc-main-disconnect-mutation-observer');

    // Set the selected tab as active and the rest as inactive
    tabList.forEach(tab => tab.isActive = false);
    let selectedTab = tabList.find(tab => tab.tabId === tabId); 
    selectedTab.isActive = true;

    setTabViewEventlistenersAndLoadURL(selectedTab);
    updateOmnibox();
    updateBookmarksIcon();
    clearSidebarAndUpdateQuadTree();

    // After updating the active tab, reconnect the mutation observer of the newly active tab
    let newActiveTab = tabList.find(tab => tab.isActive === true);
    newActiveTab.webContentsView.webContents.send('ipc-main-reconnect-mutation-observer');

    // Moving the selected tab to the front by removing and re-adding the tabView to the main window child views
    mainWindow.contentView.removeChildView(selectedTab.webContentsView);
    mainWindow.contentView.addChildView(selectedTab.webContentsView);
    removeOverlay();
})

ipcMain.on('ipc-overlays-tab-deleted', (event, tabId) => {
    // Removing the tabView from the main window child views
    let deletedTabView = tabList.find(tab => tab.tabId === tabId);
    mainWindow.contentView.removeChildView(deletedTabView.webContentsView);
    
    // Disconnecting the mutation observer of the deleted tab
    deletedTabView.webContentsView.webContents.send('ipc-main-disconnect-mutation-observer');

    // Removing the tab from the tabList
    tabList = tabList.filter(tab => tab.tabId !== tabId);

    // If the closed tab was active, set the last tab as active
    if (deletedTabView.isActive && tabList.length > 0) {
        tabList[tabList.length - 1].isActive = true;
    }
})

ipcMain.on('ipc-overlays-bookmark-selected', (event, url) => {
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.loadURL(url);
    removeOverlay();
})

ipcMain.on('ipc-overlays-bookmarks-updated', async (event, updatedBookmarks, deletedURL, bookmark) => {
    // Update the bookmarks array
    bookmarks = updatedBookmarks;
    updateBookmarksIcon(); 
    
    // If a new bookmark has been added, add it also to the database
    if (bookmark) addBookmarkToDatabase(bookmark);
    // If the bookmark has been deleted, remove the bookmark from the database
    else if (deletedURL) deleteBookmarkByUrl(deletedURL);
})

// ------------------
// NAVIGATION OVERLAY
// ------------------

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

// ---------------------
// ACCESSIBILITY OVERLAY
// ---------------------

ipcMain.on('ipc-overlays-refresh', (event) => {
    removeOverlay();
    var tab = tabList.find(tab => tab.isActive === true);
    if (tab.isErrorPage) {
        tab.webContentsView.webContents.loadURL(tab.originalURL);
    } else {
        tab.webContentsView.webContents.reload();
    }
})

ipcMain.on('ipc-overlays-settings', (event) => {
    // to be implemented
});

ipcMain.on('ipc-overlays-zoom-in', (event) => {
    handleZoom("in");
});

ipcMain.on('ipc-overlays-zoom-out', (event) => {
    handleZoom("out");
});

ipcMain.on('ipc-overlays-zoom-reset', (event) => {
    handleZoom("reset");
});

ipcMain.on('ipc-overlays-toggle-dwell', (event) => {
    toggleDwelling();
});

ipcMain.on('ipc-overlays-toggle-nav', (event) => {
    toggleNavigation();
});

ipcMain.on('ipc-overlays-toggle-useRobotJS', (event) => {
    toggleUseRobotJS();
});

ipcMain.on('ipc-exit-browser', async(event) => {
    removeOverlay();
    await deleteAndInsertAllTabs();
    app.quit();
});

// ipcMain.on('ipc-overlays-about', (event) => {
//     // to be implemented
// });

ipcMain.on('ipc-keyboard-input', (event, value, element, submit, updateValueAttr = false) => {    
    removeOverlay();

    console.log("Keyboard value: ", value, element, submit);
    // If the input is for the omnibox, send it to the main window, else send it to the active tab
    if (element.id === "url") { // "url" is the id of the omni box 
        mainWindowContent.webContents.send('ipc-mainwindow-keyboard-input', value);
    } else {
        var tab = tabList.find(tab => tab.isActive === true);

        //Focus on window first before going forward
        tab.webContentsView.webContents.focus();
        tab.webContentsView.webContents.send('ipc-tabview-keyboard-input', value, element, submit, updateValueAttr);
        // After updating the value of an element, the quadtree is regenerated to reflect the changes in the sidebar element's attributes
        setTimeout(() => {
            tab.webContentsView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
        }, 300);
    }
});

ipcMain.on('log', (event, loggedItem) => {
    log.info(event);
    log.info(loggedItem);
});


// =================================
// ======= HELPER FUNCTIONS ========
// =================================

async function initialiseVariables (){
    bookmarks = await db.getBookmarks();
    tabsFromDatabase = await db.getTabs();
    defaultUrl = await db.getDefaultURL();
    rangeWidth = await db.getRangeWidth();
    rangeHeight = await db.getRangeHeight();
    useNavAreas = await db.getActivateNavAreas();
    useRobotJS = await db.getUseRobotJS();
    scrollDistance = await db.getTabScrollDistance();
    dwellTime = await db.getDwellTime();
    menuAreaScrollDistance = await db.getMenuScrollDistance();
    menuAreaScrollInterval = await db.getMenuScrollInterval();
}

function createSplashWindow() {

    splashWindow = new BaseWindow({
        width: 500,
        height: 503,
        transparent: true,
        frame: false,
        // alwaysOnTop: true
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
            title: "Cactus",
            icon: path.join(__dirname, '../resources/logo.png')
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
            mainWindowContent.webContents.send('mainWindowLoaded', dwellTime, menuAreaScrollDistance, menuAreaScrollInterval);
            // if (isDevelopment) mainWindowContent.webContents.openDevTools();
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
                    // If the tablist has already been populated from the database, do not create a new tabview
                    if (tabsFromDatabase.length === 0) {
                        createTabview(defaultUrl);
                    } else {                        
                        tabsFromDatabase.forEach(tab => {
                            createTabview(tab.url, false, tab);
                        });

                        // Reorder the tabs in the main window to display the active tab on top
                        let activeTab = tabList.find(tab => tab.isActive === true);
                        mainWindow.contentView.removeChildView(activeTab.webContentsView);
                        mainWindow.contentView.addChildView(activeTab.webContentsView);
                    }
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
            // mainWindowContent.webContents.openDevTools() // to remove
            if (isDevelopment) mainWindowContent.webContents.openDevTools();
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

async function createTabview(url, isNewTab = false, tabFromDatabase = null) {
    let tab;

    //Create browser view
    let tabView = new WebContentsView({
        //https://www.electronjs.org/docs/latest/tutorial/security
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../src/preload/tabview/preload-tabview.js'),
        }
    });

    if (tabFromDatabase) {
        tab = { 
            tabId: tabFromDatabase.id, 
            webContentsView: tabView, 
            url: tabFromDatabase.url,
            title: tabFromDatabase.title,
            isActive: tabFromDatabase.isActive === 1 ? true : false, 
            snapshot: tabFromDatabase.snapshot, 
            isErrorPage: tabFromDatabase.isErrorPage, 
            originalURL: tabFromDatabase.originalURL,
            setEventHandlers: true
        };

        tabList.push(tab);
    } else {
        //Set new tab as active (if any)
        tabList.forEach(tab => {
            tab.isActive = false
        });

        // Getting the maximum tabId from the tabList and incrementing it by 1 to assign a new tabId
        const maxTabId = tabList.reduce((maxId, tab) => Math.max(maxId, tab.tabId), 0);
        tabList.push({ tabId: maxTabId + 1, webContentsView: tabView, isActive: true, setEventHandlers: false });
    }

    //Attach the browser view to the parent window
    await mainWindow.contentView.addChildView(tabView);

    if (isNewTab) {
        // tabView.setBounds({ 
        //     x: webpageBounds.x,
        //     y: webpageBounds.y + webpageBounds.height, // Starts below the visible area
        //     width: webpageBounds.width,
        //     height: webpageBounds.height
        // });
        // slideUpView(tabView);

        tabView.setBounds({
            x: webpageBounds.x + webpageBounds.width, // Starts to the right of the visible area
            y: webpageBounds.y,
            width: webpageBounds.width,
            height: webpageBounds.height
        });
        slideInView(tabView);
    } else {
        //Set its location/dimensions as per the webpage bounds
        tabView.setBounds(webpageBounds);
    }

    // If a new tab is created (therefore, tabFromDatabase is null), or the tab is from the database, and it is the active tab, set the event listeners
    if (!tabFromDatabase || (tabFromDatabase && tabFromDatabase.isActive)) {
        setTabViewEventlisteners(tabView);

        //Load the default home page
        if (!tabFromDatabase) {
            tabView.webContents.loadURL(url);
        } else if (tabFromDatabase.isErrorPage)  { 
            tabView.webContents.loadURL(tabFromDatabase.originalURL);
        } else {
            tabView.webContents.loadURL(tabFromDatabase.url);
        }
    }
}

function setTabViewEventlisteners(tabView) {
    //Once the DOM is ready, send a message to initiate some further logic
    tabView.webContents.on('dom-ready', () => {
        insertRendererCSS();

        const scriptToExecute = path.join(__dirname, '../src/renderer/tabview/render-tabview.js');
        const scriptContent = fs.readFileSync(scriptToExecute, 'utf-8');
        const iframeScriptToExecute = path.join(__dirname, '../src/renderer/tabview/render-iframe.js');
        const iframeScriptContent = fs.readFileSync(iframeScriptToExecute, 'utf-8');

        tabView.webContents.executeJavaScript(scriptContent).then(() => {
            // This event fires when the tabView is attached

            // If the tab is active, send isActive = true to connect the mutation observer
            if (tabList.find(tab => tab.webContentsView === tabView && tab.isActive)) {
                tabView.webContents.send('ipc-main-tabview-loaded', useNavAreas, scrollDistance, true);
            } else {
                tabView.webContents.send('ipc-main-tabview-loaded', useNavAreas, scrollDistance, false);
            }

            // injecting javascript into each first level iframe of the tabview
            tabView.webContents.mainFrame.frames.forEach(async(frame) => {
                if (frame.parent !== null && frame.url !== 'about:blank') { // Only inject into iframes that are not blank
                    try {
                        await frame.executeJavaScript(iframeScriptContent)
                    } catch (error) {
                        console.error("Error injecting into iframe:", error);
                    }
                }
            });

            tabView.webContents.send('ipc-iframes-loaded', scrollDistance);
        });

        tabView.webContents.openDevTools(); // to remove
        if (isDevelopment) tabView.webContents.openDevTools();
    });

    //Loading event - update omnibox
    tabView.webContents.on('did-start-loading', () => {
        // If the event emitted is from the active tab, update the omnibox
        let activeTab = tabList.find(tab => tab.isActive === true);
        if (tabView === activeTab.webContentsView) {
            mainWindowContent.webContents.send('tabview-loading-start');
        }
    });

    tabView.webContents.on('did-stop-loading', () => {
        // If the event emitted is from the active tab, update the omnibox
        let activeTab = tabList.find(tab => tab.isActive === true);
        if (tabView === activeTab.webContentsView) {
            updateOmnibox();
        }
    });

    tabView.webContents.on('did-finish-load', () => {
        captureSnapshot();
        updateBookmarksIcon();
        clearSidebarAndUpdateQuadTree();
    });

    const handleLoadError = (errorCode, attemptedURL) => {
        // Storing the active tab's original URL before the error page is loaded.
        let activeTab = tabList.find(tab => tab.isActive === true);
        activeTab.originalURL = attemptedURL;
        activeTab.isErrorPage = true;

        tabView.webContents.loadURL(path.join(__dirname, '../src/pages/error.html')).then(() => {
            tabView.webContents.executeJavaScript(`    
                // Update the content based on the error code
                const errorTitle = document.getElementById('error-title');
                const errorMessage = document.getElementById('error-message');
    
                switch (${errorCode}) {
                    case 402:
                        errorTitle.textContent = '402 Payment Required';
                        errorMessage.textContent = 'Payment is required to access this resource.';
                        break;
                    case 403:
                        errorTitle.textContent = '403 Forbidden';
                        errorMessage.textContent = 'You do not have permission to access this resource.';
                        break;
                    case 404:
                        errorTitle.textContent = '404 Not Found';
                        errorMessage.textContent = 'The requested resource could not be found.';
                        break;
                    case 408:
                        errorTitle.textContent = '408 Request Timeout';
                        errorMessage.textContent = 'The server timed out waiting for the request.';
                        break;
                    case 425:
                        errorTitle.textContent = '425 Page Not Working';
                        errorMessage.textContent = 'If the problem continues, contact the site owner.';
                        break;
                    case 500:
                        errorTitle.textContent = '500 Internal Server Error';
                        errorMessage.textContent = 'The server encountered an internal error.';
                        break;
                    case 501:
                        errorTitle.textContent = '501 Not Implemented';
                        errorMessage.textContent = 'The server does not support the functionality required to fulfill the request.';
                        break;
                    case 502:
                        errorTitle.textContent = '502 Bad Gateway';
                        errorMessage.textContent = 'The server received an invalid response from the upstream server.';
                        break;
                    case 503:
                        errorTitle.textContent = '503 Service Unavailable';
                        errorMessage.textContent = 'The server is currently unable to handle the request due to temporary overloading or maintenance.';
                        break;
                    case 504:
                        errorTitle.textContent = '504 Gateway Timeout';
                        errorMessage.textContent = 'The server did not receive a timely response from the upstream server.';
                        break;
                    case -6:
                        errorTitle.textContent = 'File Not Found';
                        errorMessage.textContent = 'It may have been moved, edited or deleted.';
                        break;
                    case -105:
                        errorTitle.textContent = 'DNS Error';
                        errorMessage.textContent = 'The website address could not be found.';
                        break;
                    case -106:
                        errorTitle.textContent = 'Network Error';
                        errorMessage.textContent = 'There was a problem connecting to the network.';
                        break;
                    default:
                        errorTitle.textContent = 'Error';
                        errorMessage.textContent = 'An unexpected error occurred.';
                        break;
                }

                // Add event listener to the reload button
                const reloadButton = document.querySelector('button[aria-label="Reload the page"]');
                if (reloadButton) {
                    reloadButton.addEventListener('click', () => {
                        window.location.href = '${attemptedURL}';
                    });
                }
            `);
        });
    };

    tabView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) {
            handleLoadError(errorCode, validatedURL);
        }
    });

    tabView.webContents.on('did-fail-provisional-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) {
            handleLoadError(errorCode, validatedURL);
        }
    });

    tabView.webContents.session.webRequest.onResponseStarted((details) => {
        const activeTab = tabList.find(tab => tab.isActive === true);
        const responseWebContentsId = details.webContentsId;
        const activeTabWebContentsId = activeTab.webContentsView.webContents.id;
        
        let goingToLoadErrorPage = details.url.endsWith('error.html')

        // The following if statement filters out the devtools URLs
        if (details.resourceType === 'mainFrame' && !details.url.startsWith('devtools:')) {

            // If the response is for the active tab
            if (responseWebContentsId === activeTabWebContentsId) {
                if (details.statusCode < 400 && !goingToLoadErrorPage) {
                    // Successful page load
                    activeTab.isErrorPage = false;
                    activeTab.originalURL = details.url; // Update the original URL
                    goingToLoadErrorPage = false;
                } else {
                    // Error detected
                    // When an error occurs, the next page to be loaded is the error page itself which results in a false positive
                    // To prevent this, we set a flag to indicate that the next page to be loaded is an error page
                    if (details.statusCode < 400) {
                        goingToLoadErrorPage = false;
                    } else {
                        handleLoadError(details.statusCode, details.url);
                        goingToLoadErrorPage = true;
                    }
                }
            }
        }
    });

    //React to in-page navigation (e.g. anchor links)
    tabView.webContents.on('did-navigate-in-page', (event, url) => {
        const anchorTag = url.split('#')[1];
        if (anchorTag) {
            tabView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
        }
    });

    tabView.webContents.setWindowOpenHandler(({ url }) => {
        createTabview(url, isNewTab = true);
    });
}

function updateOmnibox() {
    let activeTab = tabList.find(tab => tab.isActive === true);
    let pageDetails = {
        title: activeTab.webContentsView.webContents.getTitle(),
        url: activeTab.webContentsView.webContents.getURL(),
        isErrorPage: activeTab.isErrorPage,
    }
    mainWindowContent.webContents.send('tabview-loading-stop', pageDetails);
}

function updateBookmarksIcon() {
    let activeTab = tabList.find(tab => tab.isActive === true);
    let activeURL = activeTab.webContentsView.webContents.getURL();
    let isBookmark = bookmarks.some(bookmark => bookmark.url === activeURL);
    mainWindowContent.webContents.send('ipc-main-update-bookmark-icon', isBookmark);
}

function clearSidebarAndUpdateQuadTree() {
    mainWindowContent.webContents.send('ipc-mainwindow-clear-sidebar');
    tabList.find(tab => tab.isActive === true).webContentsView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
}

function setTabViewEventlistenersAndLoadURL(tab) {
    // If the selected tab has set its event handlers yet, set them - This is to prevent the event handlers from being set multiple times
    // and for the JS and CSS to be injected only once it is the active tab.
    if (tab.setEventHandlers) {
        setTabViewEventlisteners(tab.webContentsView);
        tab.setEventHandlers = false;

        if (tab.isErrorPage)  { 
            tab.webContentsView.webContents.loadURL(tab.originalURL);
        } else {
            tab.webContentsView.webContents.loadURL(tab.url);
        }
    }

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

async function captureSnapshot() {
    return new Promise((resolve, reject) => {
        var tab = tabList.find(tab => tab.isActive === true);
        if (tab && tab.webContentsView && tab.webContentsView.webContents) {
            tab.webContentsView.webContents.capturePage().then(snapshot => {
                tab.snapshot = snapshot.toDataURL();
                resolve();
            }).catch(err => {
                console.error('Error capturing snapshot:', err.message);
                reject(err);
            });
        } else {
            reject(new Error('Active tab or webContents not available for capture'));
        }
    }).catch(err => {
        console.error('Error in captureSnapshot:', err.message);
    });
}

function removeOverlay() {
    if (overlayContent) {
        mainWindow.contentView.removeChildView(overlayContent);
        overlayContent = null;
        isKeyboardOverlay = null;
    }
}

async function createOverlay(overlayAreaToShow, elementProperties) {
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
    overlayContent.webContents.focus();
    
    isKeyboardOverlay = overlayAreaToShow === 'keyboard';
    let overlaysData = {
        overlayAreaToShow: overlayAreaToShow,
        tabList: [],
        bookmarks: [],
        canGoBack: true,
        canGoForward: true,
        isDwellingActive: isDwellingActive,
        useNavAreas: useNavAreas,
        useRobotJS: useRobotJS,
    };

    switch (overlayAreaToShow) {
        case 'keyboard':
            let keyboardLayout = await db.getDefaultLayout();
            overlayContent.webContents.send('ipc-main-keyboard-loaded', elementProperties, keyboardLayout);
            break;
        case 'tabs':
            // Extracting serializable properties from tabList
            const serializableTabList = tabList.map(tab => ({
                tabId: tab.tabId,
                isActive: tab.isActive,
                snapshot: tab.snapshot,
                title: tab.webContentsView.webContents.getTitle() ? tab.webContentsView.webContents.getTitle() : tab.title,
                url: tab.webContentsView.webContents.getURL() ? tab.webContentsView.webContents.getURL() : tab.url,
            }));

            overlaysData.tabList = serializableTabList;
            overlaysData.bookmarks = bookmarks;
            break;
        case 'bookmarks':
            overlaysData.bookmarks = bookmarks;
            break;
        case 'navigation':
            // Check if the active tab can go back and forward
            let tab = tabList.find(tab => tab.isActive === true);
            let canGoBack = tab.webContentsView.webContents.canGoBack();
            let canGoForward = tab.webContentsView.webContents.canGoForward();

            overlaysData.canGoBack = canGoBack;
            overlaysData.canGoForward = canGoForward;
            break;
    }

    if (!isKeyboardOverlay) overlayContent.webContents.send('ipc-main-overlays-loaded', overlaysData);

    if (isDevelopment) overlayContent.webContents.openDevTools();
    overlayContent.webContents.openDevTools(); // to remove
}

async function registerSwitchShortcutCommands() {
    const shortcuts = await db.getShortcuts();

    const shortcutActions = [
        { action: "click", handler: () => handleClickShortcut() },
        { action: "toggleOmniBox", handler: () => handleToggleOmniBoxShortcut() },
        { action: "sidebarScrollUp", handler: () => handleSidebarScrollUpShortcut() },
        { action: "sidebarScrollDown", handler: () => handleSidebarScrollDownShortcut() },
        { action: "navigateForward", handler: () => handleNavigateForwardShortcut() },
        { action: "navigateBack", handler: () => handleNavigateBackShortcut() },
        { action: "toggleDwelling", handler: () => handleToggleDwellingShortcut() },
        { action: "zoomIn", handler: () => handleZoomInShortcut() },
        { action: "zoomOut", handler: () => handleZoomOutShortcut() },
    ];

    shortcutActions.forEach(({ action, handler }) => {
        const shortcut = shortcuts.find(s => s.action === action);
        if (shortcut) {
            globalShortcut.register(shortcut.shortcut, handler);
        }
    });
}

function handleClickShortcut() {
    console.log("Clicking shortcut triggered");
    const cursorPosition = screen.getCursorScreenPoint();

    const isCursorWithinBounds = (bounds) => {
        return (
            cursorPosition.x >= bounds.x &&
            cursorPosition.x <= bounds.x + bounds.width &&
            cursorPosition.y >= bounds.y &&
            cursorPosition.y <= bounds.y + bounds.height
        );
    };

    if (overlayContent && isCursorWithinBounds(overlayContent.getBounds())) {
        overlayContent.webContents.send('ipc-trigger-click-under-cursor');
        return;
    }

    const activeTab = tabList.find(tab => tab.isActive);

    if (activeTab && isCursorWithinBounds(activeTab.webContentsView.getBounds())) {
        activeTab.webContentsView.webContents.send('ipc-trigger-click-under-cursor');
        console.log("Clicking on active tab");
        return;
    }

    if (isCursorWithinBounds(mainWindowContent.getBounds())) {
        mainWindowContent.webContents.send('ipc-trigger-click-under-cursor');
    }
}

function handleToggleOmniBoxShortcut() {
    if (overlayContent && isKeyboardOverlay) {
        removeOverlay();
    } else {
        mainWindowContent.webContents.send('ipc-mainwindow-load-omnibox');
    }
}

function handleSidebarScrollUpShortcut() {
    mainWindowContent.webContents.send('ipc-main-sidebar-scrollup');
}

function handleSidebarScrollDownShortcut() {
    mainWindowContent.webContents.send('ipc-main-sidebar-scrolldown');
}

function handleNavigateForwardShortcut() {
    console.log("Navigate forward shortcut triggered");
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-tabview-forward');
}

function handleNavigateBackShortcut() {
    console.log("Navigate back shortcut triggered");
    var tab = tabList.find(tab => tab.isActive === true);
    tab.webContentsView.webContents.send('ipc-tabview-back');
}

function handleToggleDwellingShortcut() {
    toggleDwelling();
}

function handleZoomInShortcut() {
    handleZoom("in", true);
}

function handleZoomOutShortcut() {
    handleZoom("out", true);
}

function toggleDwelling() {
    isDwellingActive = !isDwellingActive
    mainWindowContent.webContents.send('ipc-mainwindow-handle-dwell-events', isDwellingActive);
}

function toggleNavigation() {
    useNavAreas = !useNavAreas;
    tabList.forEach(tab => {
        tab.webContentsView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
    });
}

function toggleUseRobotJS() {
    useRobotJS = !useRobotJS;
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

function getFullURL(url) {
    let fullUrl;

    if (url) {
        //Assume all is ok
        fullUrl = url;
        var tab = tabList.find(tab => tab.isActive === true);
        const currentURL = new URL(tab.webContentsView.webContents.getURL());
        const protocol = currentURL.protocol;
        const host = currentURL.host;

        //Handle URLs without protocol (e.g. //www.google.com)
        if (url.startsWith('//')) {
            fullUrl = protocol + url;
        } else if (url.startsWith('/') || url.startsWith('../') || url.startsWith('./')) {
            //Handle relative path URLs (e.g. /path/to/resource)
            fullUrl = new URL(url, currentURL).href;
            // fullUrl = protocol + '//' + host + url; // This is the original which doesn't work
        } else if (url.startsWith('#')) {
            //Handle anchors (e.g. #element-id)
            let currentAnchorPos = currentURL.href.indexOf('#');
            if (currentAnchorPos > 0) {
                fullUrl = currentURL.href.substring(0, currentAnchorPos) + url;
            } else {
                fullUrl = currentURL.href + url;
            }
        }
        else {
            if (url.startsWith(protocol))
                //Take as is
                fullUrl = url;
            else
                //Assume document name only (e.g. page.html)
                fullUrl = new URL(url, currentURL).href;
        }
    }

    return fullUrl;
}


// =================================
// ====== DATABASE FUNCTIONS =======
// =================================

async function addBookmarkToDatabase(bookmark){
    try {
        await db.addBookmark(bookmark);
    } catch (err) {
        console.error('Error adding bookmark to database:', err.message);
    }
}

async function deleteBookmarkByUrl(url){
    try {
        await db.deleteBookmarkByUrl(url);
    } catch (err) {
        console.error('Error removing bookmark from database:', err.message);
    }
}

async function deleteAndInsertAllTabs() {
    try {
        // Empty the table in the database before quitting
        await db.deleteAllTabs();

        // Update the database with the open tabs
        for (const tab of tabList) {
            const tabData = {
                url: !tab.isErrorPage ? (tab.webContentsView.webContents.getURL() ? tab.webContentsView.webContents.getURL() : tab.url) : null,
                title: tab.webContentsView.webContents.getTitle() ? tab.webContentsView.webContents.getTitle() : tab.title,
                isActive: tab.isActive,
                snapshot: tab.snapshot,
                originalURL: tab.originalURL,
                isErrorPage: tab.isErrorPage
            };

            await db.addTab(tabData);
        }
    } catch (err) {
        console.error('Error updating database with open tabs:', err.message);
    }
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
