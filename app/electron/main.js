const { app, BaseWindow, WebContentsView, ipcMain, globalShortcut, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const { QuadtreeBuilder, InteractiveElement, HTMLSerializableElement, QtPageDocument, QtBuilderOptions, QtRange } = require('cactus-quadtree-builder');
const { MenuBuilder, NavArea, HTMLSerializableMenuElement, MenuPageDocument, MenuBuilderOptions, MenuRange } = require('cactus-menu-builder');
const { log } = require('electron-log');
const robot = require("robotjs_addon");
const db = require('../database/database.js');
const { Settings, KeyboardLayouts, Shortcuts } = require('../src/tools/enums.js');
const logger = require('../src/tools/logger.js');

const isDevelopment = process.env.NODE_ENV === "development";
let dwellRangeWidth;
let dwellRangeHeight;
let useNavAreas;
let useRobotJS;
let isDwellingActive;
let defaultUrl;
let scrollDistance;
let scrollInterval;
let menuAreaScrollDistance;
let menuAreaScrollInterval;
let keyboardDwellTime;
let dwellTime;
let quickDwellRange;

let mainWindow, splashWindow
let mainWindowContent, isKeyboardOverlay
let webpageBounds = {}
let currentQt, currentNavAreaTree
let timeoutCursorHovering
let tabList = [];
let overlayList = [];
let tabsFromDatabase = [];
let bookmarks = [];
let successfulLoad;
let scrollButtonsRemoved = false;


// =========================================
// === UNCAUGHT EXCEPTION AND REJECTIONS ===
// =========================================

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection: ${reason}`);
});

// =================================
// ====== APP EVENT LISTENERS ======
// =================================

app.whenReady().then(async () => {
    try {
        await db.connect();
        await db.createTables();
        await initialiseVariables();
    } catch (err) {
        logger.error('Error initializing database:', err.message);
    }

    try {
        createSplashWindow();
        setTimeout(() => {
            try {
                createMainWindow();
            } catch (err) {
                logger.error('Error creating main window:', err.message);
            }
        }, 3000); // This is the duration of the splash screen gif

        registerSwitchShortcutCommands();
    } catch (err) {
        logger.error('Error during app initialization:', err.message);
    }
});

app.on('window-all-closed', async () => {
    try {
        await deleteAndInsertAllTabs();

        // App closes when all windows are closed, however this is not default behaviour on macOS (applications and their menu bar to stay active)
        if (process.platform !== 'darwin') {
            app.quit()
        }
    } catch (err) {
        logger.error('Error during app closure:', err.message);
    }
});

app.on('activate', () => {
    try {
        // On macOS re-create window when the dock icon is clicked (with no other windows open).
        if (BaseWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    } catch (err) {
        logger.error('Error during app activation:', err.message);
    }
})


// =================================
// ======= IPC COMMUNICATION =======
// =================================


// ---------
//  LOGGING
// ---------

ipcMain.on('ipc-log-error-message', (event, message) => {
    logger.error(message);
});

// ---------

ipcMain.handle('tabview-can-go-back-or-forward', (event) => {
    try {
        // Check if the active tab can go back or forward
        var tab = tabList.find(tab => tab.isActive === true);
        var canGoBack = tab.webContentsView.webContents.canGoBack();
        var canGoForward = tab.webContentsView.webContents.canGoForward();
        if (canGoBack || canGoForward) return true;
    } catch (err) {
        logger.error('Error checking tab navigation:', err.message);
        return false;
    }
});

ipcMain.handle('ipc-get-user-setting', async (event, setting) => {
    try {
        switch (setting) {
            case Settings.DWELL_TIME.NAME:
                return dwellTime;
            case Settings.DWELL_RANGE.NAME:
                return quickDwellRange;
            case Settings.KEYBOARD_DWELL_TIME.NAME:
                return keyboardDwellTime;
            case Settings.MENU_AREA_SCROLL_DISTANCE.NAME:
                return menuAreaScrollDistance; 99
            case Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS.NAME:
                return menuAreaScrollInterval;
            case Settings.TAB_VIEW_SCROLL_DISTANCE.NAME:
                return scrollDistance;
            case Settings.RANGE_WIDTH.NAME:
                return dwellRangeWidth;
            case Settings.RANGE_HEIGHT.NAME:
                return dwellRangeHeight;
            case Settings.USE_NAV_AREAS.NAME:
                return useNavAreas;
            case Settings.IS_DWELLING_ACTIVE.NAME:
                return isDwellingActive;
            default:
                throw new Error(`Unknown setting: ${setting}`);
        }
    } catch (err) {
        logger.error('Error fetching user setting:', err.message);
        throw err;
    }
});

// This creates a quadtree using serialisable HTML elements passed on from the renderer
ipcMain.on('ipc-tabview-generateQuadTree', (event, contents) => {
    try {
        var tab = tabList.find(tab => tab.isActive === true);
        // Recreate quadtree
        let bounds = tab.webContentsView.getBounds();
        //Taking zoom factor into account
        let adjustedWidth = bounds.width / tab.webContentsView.webContents.zoomFactor;
        let adjustedHeight = bounds.height / tab.webContentsView.webContents.zoomFactor;

        qtOptions = new QtBuilderOptions(adjustedWidth, adjustedHeight, 'new', 1);
        qtBuilder = new QuadtreeBuilder(qtOptions);

        const visibleElements = contents.serializedVisibleElements.map(e => {
            try {
                let htmlSerializableElement = new HTMLSerializableElement(e);
                return InteractiveElement.fromHTMLElement(htmlSerializableElement);
            } catch (err) {
                logger.error('Error processing visible element:', err.message);
                return null;
            }
        }).filter(Boolean);

        let pageDocument = new QtPageDocument(contents.docTitle, contents.docURL, visibleElements, adjustedWidth, adjustedHeight, null);

        qtBuilder.buildAsync(pageDocument).then((qt) => {
            try {
                currentQt = qt;
                //Only in debug mode - show which points are available for interaction

                if (isDevelopment) {
                    const viewRange = new QtRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
                    const elementsInView = qt.queryRange(viewRange);

                    contents = {
                        elementsInView: elementsInView,
                        dwellRangeWidth: dwellRangeWidth,
                        dwellRangeHeight: dwellRangeHeight,
                        color: '#702963'
                    };

                    tab.webContentsView.webContents.send('ipc-clear-highlighted-elements');
                    tab.webContentsView.webContents.send('ipc-highlight-available-elements', contents);
                }
            } catch (err) {
                logger.error('Error during quadtree processing:', err.message);
            }
        }).catch(err => {
            logger.error("Error building quadtree: ", err.message);
        });
    } catch (err) {
        logger.error("Error generating quadtree: ", err.message);
    }
});

ipcMain.on('ipc-tabview-generateNavAreasTree', (event, contents) => {
    try {
        //Recreate quadtree    
        var tab = tabList.find(tab => tab.isActive === true);
        let bounds = tab.webContentsView.getBounds();
        let menuBuilderOptions = new MenuBuilderOptions(bounds.width, bounds.height, 'new');
        let menuBuilder = new MenuBuilder(menuBuilderOptions);

        const visibleElements = contents.serializedVisibleMenus.map(e => {
            try {
                let htmlSerializableMenuElement = createHTMLSerializableMenuElement(e);
                return NavArea.fromHTMLElement(htmlSerializableMenuElement);
            } catch (err) {
                logger.error('Error processing visible menu element:', err.message);
                return null;
            }
        }).filter(Boolean);

        let pageDocument = new MenuPageDocument(contents.docTitle, contents.docURL, visibleElements, bounds.width, bounds.height, null);

        menuBuilder.buildAsync(pageDocument).then((hierarchicalAreas) => {
            try {
                currentNavAreaTree = hierarchicalAreas;

                //Only in debug mode - show which points are available for interaction
                if (isDevelopment) {
                    const viewRange = new MenuRange(0, 0, pageDocument.documentWidth, pageDocument.documentHeight);
                    const elementsInView = currentNavAreaTree.queryRange(viewRange, true);

                    contents = {
                        elementsInView: elementsInView,
                        dwellRangeWidth: dwellRangeWidth,
                        dwellRangeHeight: dwellRangeHeight,
                        color: '#E34234'
                    };

                    tab.webContentsView.webContents.send('ipc-highlight-available-elements', contents);
                }
            } catch (err) {
                logger.error('Error during menu tree processing:', err.message);
            }
        }).catch(err => {
            logger.error("Error building menu tree: ", err.message);
        });
    } catch (err) {
        logger.error("Error generating menu tree: ", err.message);
    }
});

ipcMain.on('ipc-tabview-clear-sidebar', (event) => {
    mainWindowContent.webContents.send('ipc-mainwindow-clear-sidebar');
});

ipcMain.on('ipc-tabview-cursor-mouseover', (event, mouseData) => {
    try {
        clearInterval(timeoutCursorHovering);

        timeoutCursorHovering = setInterval(() => {
            try {
                // New sidebar elements are only rendered if dwelling is active. This prevents the sidebar from being populated when the user has paused dwelling
                if (isDwellingActive) {
                    const { x, y } = mouseData;

                    const qtRangeToQuery = new QtRange(x - (dwellRangeWidth / 2), y - (dwellRangeHeight / 2), dwellRangeWidth, dwellRangeHeight);
                    const menuRangeToQuery = new MenuRange(x - (dwellRangeWidth / 2), y - (dwellRangeHeight / 2), dwellRangeWidth, dwellRangeHeight);

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
            } catch (err) {
                logger.error('Error during cursor mouseover processing:', err.message);
            }
        }, 500);
    } catch (err) {
        logger.error('Error setting cursor mouseover interval:', err.message);
    }
});

ipcMain.on('ipc-tabview-cursor-mouseout', (event) => {
    try {
        clearInterval(timeoutCursorHovering);
    } catch (err) {
        logger.error('Error clearing cursor mouseout interval:', err.message);
    }
});

ipcMain.on('browse-to-url', (event, url) => {
    browseToUrl(url);
});

ipcMain.on('robot-keyboard-type', (event, { text, submit }) => {
    try {
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
    } catch (err) {
        logger.error('Error during robot keyboard type:', err.message);
    }
})

ipcMain.on('robot-keyboard-enter', (event) => {
    try {
        // Wait a short period to ensure the field is focused before performing actions
        setTimeout(() => {
            robot.keyTap("enter");
        }, 500);
    } catch (err) {
        logger.error('Error during robot keyboard enter:', err.message);
    }
})

ipcMain.on('robot-keyboard-spacebar', (event) => {
    try {
        // Wait a short period to ensure the field is focused before performing actions
        robot.setKeyboardDelay(300);
        robot.keyTap("space");
    } catch (err) {
        logger.error('Error during robot keyboard spacebar:', err.message);
    }
})

ipcMain.on('robot-keyboard-backspace', (event) => {
    try {
        // Wait a short period to ensure the field is focused before performing actions
        robot.keyTap("backspace");
    } catch (err) {
        logger.error('Error during robot keyboard backspace:', err.message);
    }
})

ipcMain.on('robot-keyboard-numpad', (event, number) => {
    try {
        // Wait a short period to ensure the field is focused before performing actions
        robot.typeString(number);
    } catch (err) {
        logger.error('Error during robot keyboard numpad:', err.message);
    }
})

ipcMain.on('robot-keyboard-arrow-key', (event, direction) => {
    try {
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
    } catch (err) {
        logger.error('Error during robot keyboard arrow key:', err.message);
    }
})

ipcMain.on('ipc-mainwindow-set-element-value', (event, element) => {
    try {
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-set-element-value', element, element.value);
    } catch (err) {
        logger.error('Error setting element value:', err.message);
    }
});

ipcMain.on('ipc-mainwindow-click-sidebar-element', (event, elementToClick) => {
    try {
        if (elementToClick) {
            if (useRobotJS) {
				robotClick(elementToClick.insertionPointX, elementToClick.insertionPointY);
			} else if ((elementToClick.type === 'a' || elementToClick.tag === 'a') && elementToClick.href && elementToClick.href != '#' && elementToClick.href != 'javascript:void(0)') {
				browseToUrl(elementToClick.href);
			} else {
				robotClick(elementToClick.insertionPointX, elementToClick.insertionPointY);
			}
        } else {
            logger.error("Element to click has not been found");
        }
    } catch (err) {
        logger.error('Error clicking sidebar element:', err.message);
    }
})

ipcMain.on('ipc-mainwindow-highlight-elements-on-page', (event, elements) => {
    try {
        //Highlight elements on page
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-highlight-elements', elements);
    } catch (err) {
        logger.error('Error highlighting elements on page:', err.message);
    }
});

ipcMain.on('ipc-mainwindow-show-overlay', async (event, overlayAreaToShow, elementProperties) => {
    try {
        if (overlayAreaToShow === 'quickClick') {
            // remove scroll buttons on the tabview
            var tab = tabList.find(tab => tab.isActive === true);
            scrollButtonsRemoved = true;
            tab.webContentsView.webContents.send('ipc-main-remove-scroll-buttons');

            createOverlay(overlayAreaToShow, elementProperties, true);
        } else {
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
        }
    } catch (err) {
        logger.error('Error showing overlay:', err.message);
    }
})

// This event is triggered when the user clicks on the bookmark icon in the main window to add a bookmark
ipcMain.on('ipc-mainwindow-add-bookmark', async (event) => {
    try {
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
    } catch (err) {
        logger.error('Error adding bookmark:', err.message);
    }
});

// This event is triggered when the user clicks on the bookmark icon in the main window to remove a bookmark
ipcMain.on('ipc-mainwindow-remove-bookmark', async (event) => {
    try {
        let tab = tabList.find(tab => tab.isActive === true);
        let activeURL = tab.webContentsView.webContents.getURL();

        bookmarks = bookmarks.filter(bookmark => bookmark.url !== activeURL);
        deleteBookmarkByUrl(activeURL);
    } catch (err) {
        logger.error('Error removing bookmark:', err.message);
    }
});

ipcMain.on('ipc-mainwindow-open-iframe', (event, src) => {
    try {
        if (src) {
            createTabview(getFullURL(src), newTab = true);
        }
    } catch (err) {
        logger.error('Error opening iframe:', err.message);
    }
})

ipcMain.on('ipc-overlays-remove', (event) => {
    try {
        removeOverlay();
    } catch (err) {
        logger.error('Error removing overlay:', err.message);
    }
})

ipcMain.on('ipc-overlays-remove-and-update', (event) => {
    try {
        let newActiveTab = tabList.find(tab => tab.isActive === true);
        updateOmnibox();
        updateBookmarksIcon();
        clearSidebarAndUpdateQuadTree();
        removeOverlay();
        setTabViewEventlistenersAndLoadURL(newActiveTab);

        // In case the active tab has been updated, reconnect the mutation observer of the newly active tab
        newActiveTab.webContentsView.webContents.send('ipc-main-reconnect-mutation-observer');
    } catch (err) {
        logger.error('Error removing and updating overlay:', err.message);
    }
})

// TABS OVERLAY
ipcMain.on('ipc-overlays-newTab', (event) => {
    try {
        // Before updating the active tab, disconnect the mutation observer of the previous active tab
        let previousActiveTab = tabList.find(tab => tab.isActive === true);
        previousActiveTab.webContentsView.webContents.send('ipc-main-disconnect-mutation-observer');

        removeOverlay();
        createTabview(defaultUrl, newTab = true);
        clearSidebarAndUpdateQuadTree();
    } catch (err) {
        logger.error('Error creating new tab:', err.message);
    }
})

ipcMain.on('ipc-overlays-tab-selected', (event, tabId) => {
    try {
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
    } catch (err) {
        logger.error('Error selecting tab:', err.message);
    }
})

ipcMain.on('ipc-overlays-tab-deleted', (event, tabId) => {
    try {
        // Removing the tabView from the main window child views
        let deletedTabView = tabList.find(tab => tab.tabId === tabId);
        mainWindow.contentView.removeChildView(deletedTabView.webContentsView);

        // Disconnecting the mutation observer of the deleted tab
        deletedTabView.webContentsView.webContents.send('ipc-main-disconnect-mutation-observer');

        // Destroying the webContents to stop any background activity - like a video playing
        deletedTabView.webContentsView.webContents.destroy();

        // Removing the tab from the tabList
        tabList = tabList.filter(tab => tab.tabId !== tabId);

        // If the closed tab was active, set the last tab as active
        if (deletedTabView.isActive && tabList.length > 0) {
            tabList[tabList.length - 1].isActive = true;
        }
    } catch (err) {
        logger.error('Error deleting tab:', err.message);
    }
})

ipcMain.on('ipc-overlays-bookmark-selected', (event, url) => {
    try {
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.loadURL(url);
        removeOverlay();
    } catch (err) {
        logger.error('Error selecting bookmark:', err.message);
    }
})

ipcMain.on('ipc-overlays-bookmarks-updated', async (event, updatedBookmarks, deletedURL, bookmark) => {
    try {
        // Update the bookmarks array
        bookmarks = updatedBookmarks;
        updateBookmarksIcon();

        // If a new bookmark has been added, add it also to the database
        if (bookmark) addBookmarkToDatabase(bookmark);
        // If the bookmark has been deleted, remove the bookmark from the database
        else if (deletedURL) deleteBookmarkByUrl(deletedURL);
    } catch (err) {
        logger.error('Error updating bookmarks:', err.message);
    }
})

// ------------------
// NAVIGATION OVERLAY
// ------------------

ipcMain.on('ipc-overlays-back', () => {
    try {
        //Select active tabview
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-back');
    } catch (err) {
        logger.error('Error navigating back:', err.message);
    }
})

ipcMain.on('ipc-overlays-forward', () => {
    try {
        //Select active tabview
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-forward');
    } catch (err) {
        logger.error('Error navigating forward:', err.message);
    }
})

// ---------------------
// ACCESSIBILITY OVERLAY
// ---------------------

ipcMain.on('ipc-overlays-refresh', (event) => {
    try {
        removeOverlay();
        var tab = tabList.find(tab => tab.isActive === true);
        if (tab.isErrorPage) {
            tab.webContentsView.webContents.loadURL(tab.originalURL);
        } else {
            tab.webContentsView.webContents.reload();
        }
    } catch (err) {
        logger.error('Error refreshing overlay:', err.message);
    }
})

ipcMain.on('ipc-overlays-settings', (event) => {
    try {
        createOverlay("settings", null, false);
    } catch (err) {
        logger.error('Error opening settings overlay:', err.message);
    }
});

ipcMain.on('ipc-overlays-zoom-in', (event) => {
    try {
        handleZoom("in");
    } catch (err) {
        logger.error('Error zooming in:', err.message);
    }
});

ipcMain.on('ipc-overlays-zoom-out', (event) => {
    try {
        handleZoom("out");
    } catch (err) {
        logger.error('Error zooming out:', err.message);
    }
});

ipcMain.on('ipc-overlays-zoom-reset', (event) => {
    try {
        handleZoom("reset");
    } catch (err) {
        logger.error('Error resetting zoom:', err.message);
    }
});

ipcMain.on('ipc-overlays-toggle-dwell', (event) => {
    try {
        toggleDwelling();
    } catch (err) {
        logger.error('Error toggling dwell:', err.message);
    }
});

ipcMain.on('ipc-overlays-toggle-nav', (event) => {
    try {
        toggleNavigation();
    } catch (err) {
        logger.error('Error toggling navigation:', err.message);
    }
});

ipcMain.on('ipc-overlays-toggle-useRobotJS', (event) => {
    try {
        toggleUseRobotJS();
    } catch (err) {
        logger.error('Error toggling RobotJS:', err.message);
    }
});

ipcMain.on('ipc-exit-browser', async (event) => {
    try {
        removeOverlay();
        await deleteAndInsertAllTabs();
        app.quit();
    } catch (err) {
        logger.error('Error exiting browser:', err.message);
    }
});

// -----------------
// PRECISION OVERLAY
// -----------------

ipcMain.on('ipc-quick-click-scroll-up', (event) => {
    try {
        let activeTab = tabList.find(tab => tab.isActive === true);
        // Start scrolling up repeatedly
        scrollInterval = setInterval(() => {
            activeTab.webContentsView.webContents.executeJavaScript(`
                window.scrollBy({
                    top: (${scrollDistance * -1}),
                    left: 0,
                    behavior: "smooth"
                });
            `);
        }, 10); // Adjust the interval time (in milliseconds) as needed
    } catch (err) {
        logger.error('Error scrolling up:', err.message);
    }
});

ipcMain.on('ipc-quick-click-scroll-down', (event) => {
    try {
        let activeTab = tabList.find(tab => tab.isActive === true);
        // Start scrolling down repeatedly
        scrollInterval = setInterval(() => {
            activeTab.webContentsView.webContents.executeJavaScript(`
                window.scrollBy({
                    top: ${scrollDistance},
                    left: 0,
                    behavior: "smooth"
                });
            `);
        }, 10); // Adjust the interval time (in milliseconds) as needed
    } catch (err) {
        logger.error('Error scrolling down:', err.message);
    }
});

ipcMain.on('ipc-quick-click-scroll-stop', (event) => {
    try {
        // Stop the scrolling
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }
    } catch (err) {
        logger.error('Error stopping scroll:', err.message);
    }
});

ipcMain.on('ipc-quick-click-zoom-in', (event) => {
    try {
        handleZoom("in", false);
    } catch (err) {
        logger.error('Error zooming in:', err.message);
    }
});

ipcMain.on('ipc-quick-click-zoom-out', (event) => {
    try {
        handleZoom("out", false);
    } catch (err) {
        logger.error('Error zooming out:', err.message);
    }
});

ipcMain.on('ipc-quick-click-dwelltime-elapsed', (event) => {
    try {
        robot.mouseClick();
    } catch (err) {
        logger.error('Error during dwell time elapsed:', err.message);
    }
});

ipcMain.on('ipc-quick-click-add-scroll-buttons', (event) => {
    try {
        // Adding the scroll buttons back to the tabview if they were removed
        if (scrollButtonsRemoved) {
            var tab = tabList.find(tab => tab.isActive === true);
            tab.webContentsView.webContents.send('ipc-main-add-scroll-buttons');
            scrollButtonsRemoved = false;
        }
    } catch (err) {
        logger.error('Error adding scroll buttons:', err.message);
    }
})

// -----------------
// KEYBOARD OVERLAY
// -----------------

ipcMain.on('ipc-keyboard-input', (event, value, element, submit, updateValueAttr = false) => {    
    try {
        removeOverlay();

        console.log("Keyboard value: ", value, element, submit);
        // If the input is for the omnibox, send it to the main window, else send it to the active tab
        if (element.id === "url") { // "url" is the id of the omni box 
            if (element.isSetting) {
                defaultUrl = value.includes('.') ? new URL(value.startsWith('http') ? value : `https://${value}`).href : new URL(`https://www.${value}.com`).href;
                db.updateDefaultURL(defaultUrl);
                overlayList[overlayList.length - 1].webContents.send('ipc-setting-keyboard-input', defaultUrl);
            } else {
                mainWindowContent.webContents.send('ipc-mainwindow-keyboard-input', value);
            }
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
    } catch (err) {
        logger.error('Error during keyboard input:', err.message);
    }
});

ipcMain.on('ipc-keyboard-update-language', async (event, language) => {
    try {
        await db.updateUserSetting(Settings.DEFAULT_LAYOUT.NAME, language);
    } catch (err) {
        logger.error('Error updating keyboard language:', err.message);
    }
})

// ------------------
//  SETTINGS OVERLAY
// ------------------

ipcMain.on('ipc-settings-show-keyboard', (event, elementProperties) => {
    try {
        createOverlay('keyboard', elementProperties);
    } catch (err) {
        logger.error('Error showing keyboard overlay:', err.message);
    }
});

ipcMain.on('ipc-settings-option-selected', (event, setting, optionValue) => {
    try {
        switch (setting.label) {
            case Settings.DWELL_TIME.LABEL:
                dwellTime = optionValue;
                db.updateDwellTime(optionValue);
                mainWindowContent.webContents.send('ipc-mainwindow-update-dwell-time', optionValue);
                overlayList.slice(0, -1).forEach(overlay => {
                    overlay.webContents.send('ipc-setting-update-dwell-time', optionValue);
                });
                break;
            case Settings.KEYBOARD_DWELL_TIME.LABEL:
                keyboardDwellTime = optionValue;
                db.updateKeyboardDwellTime(optionValue);
                overlayList.forEach(overlay => {
                    overlay.webContents.send('ipc-setting-update-keyboard-dwell-time', optionValue);
                });
                break;
            case Settings.TAB_VIEW_SCROLL_DISTANCE.LABEL:
                scrollDistance = optionValue;
                db.updateTabScrollDistance(optionValue);
                tabList.forEach(tab => {
                    tab.webContentsView.webContents.send('ipc-tabview-update-scroll-distance', optionValue);
                });
                break;
            case Settings.MENU_AREA_SCROLL_DISTANCE.LABEL:
                menuAreaScrollDistance = optionValue;
                db.updateMenuScrollDistance(optionValue);
                mainWindowContent.webContents.send('ipc-mainwindow-update-scroll-distance', optionValue);
                break;
            case Settings.DEFAULT_LAYOUT.LABEL:
                db.updateDefaultLayout(optionValue);
                break;
            default:
                throw new Error(`Unknown setting: ${setting.label}`);
        }
    } catch (err) {
        logger.error('Error selecting settings option:', err.message);
    }
});

// --------
//  OTHERS
// --------

ipcMain.on('log', (event, loggedItem) => {
    try {
        log.info(event);
        log.info(loggedItem);
    } catch (err) {
        logger.error('Error logging item:', err.message);
    }
});


// =================================
// ======= HELPER FUNCTIONS ========
// =================================

async function initialiseVariables() {
    try {
        bookmarks = await db.getBookmarks();
        tabsFromDatabase = await db.getTabs();
        defaultUrl = await db.getDefaultURL();
        dwellRangeWidth = await db.getDwellRangeWidth();
        dwellRangeHeight = await db.getDwellRangeHeight();
        useNavAreas = await db.getActivateNavAreas();
        useRobotJS = await db.getUseRobotJS();
        isDwellingActive = await db.getIsDwellingActive();
        scrollDistance = await db.getTabScrollDistance();
        keyboardDwellTime = await db.getKeyboardDwellTime();
        dwellTime = await db.getDwellTime();
        quickDwellRange = await db.getQuickDwellRange();
        menuAreaScrollDistance = await db.getMenuScrollDistance();
        menuAreaScrollInterval = await db.getMenuScrollInterval();
    } catch (err) {
        logger.error("Error initializing variables: ", err);
    }
}

function createSplashWindow() {
    try {
        splashWindow = new BaseWindow({
            width: 500,
            height: 503,
            transparent: true,
            frame: false,
        });

        const splashWindowContent = new WebContentsView({ webPreferences: { transparent: true } });
        splashWindow.contentView.addChildView(splashWindowContent);
        splashWindowContent.setBounds({ x: 0, y: 0, width: splashWindow.getBounds().width, height: splashWindow.getBounds().height });
        splashWindowContent.webContents.loadURL(path.join(__dirname, '../src/pages/splash.html'));
    } catch (err) {
        logger.error('Error creating splash window:', err.message);
    }
}

function createMainWindow() {
    try {
        mainWindow = new BaseWindow({
            frame: true,
            title: "Cactus",
            icon: path.join(__dirname, '../resources/logo.png')
        });

        mainWindowContent = new WebContentsView({
            webPreferences: {
                nodeIntegrationInWorker: true,
                contextIsolation: true,
                preload: path.join(__dirname, '../src/renderer/mainwindow/render-mainwindow.js')
            },
            icon: path.join(__dirname + '../../resources/logo.png'),
            show: false
        });

        mainWindow.contentView.addChildView(mainWindowContent);
        mainWindow.maximize();
        mainWindowContent.setBounds({
            x: 0,
            y: 0,
            width: mainWindow.getContentBounds().width,
            height: mainWindow.getContentBounds().height
        });

        mainWindowContent.webContents.loadURL(path.join(__dirname, '../src/pages/index.html')).then(() => {
            try {
                mainWindowContent.webContents.send('mainWindowLoaded', dwellTime, menuAreaScrollDistance, menuAreaScrollInterval, isDwellingActive);
                mainWindowContent.webContents.openDevTools();

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
                `).then(properties => {
                    try {
                        webpageBounds = {
                            x: Math.floor(properties.x),
                            y: Math.floor(properties.y),
                            width: Math.floor(properties.width),
                            height: Math.floor(properties.height)
                        };

                        if (tabsFromDatabase.length === 0) {
                            createTabview(defaultUrl);
                        } else {
                            tabsFromDatabase.forEach(tab => {
                                createTabview(tab.url, false, tab);
                            });

                            let activeTab = tabList.find(tab => tab.isActive === true);
                            mainWindow.contentView.removeChildView(activeTab.webContentsView);
                            mainWindow.contentView.addChildView(activeTab.webContentsView);
                        }
                    } catch (err) {
                        logger.error('Error processing webpage bounds:', err.message);
                    }
                }).catch(err => {
                    logger.error('Error executing JavaScript in main window:', err.message);
                });
            } catch (err) {
                logger.error('Error loading main window content:', err.message);
            }
        });

        mainWindow.on('resized', () => {
            try {
                resizeMainWindow();
            } catch (err) {
                logger.error('Error resizing main window:', err.message);
            }
        });

        mainWindow.on('maximize', () => {
            try {
                resizeMainWindow();
            } catch (err) {
                logger.error('Error maximizing main window:', err.message);
            }
        });

        mainWindow.once('ready-to-show', () => {
            try {
                mainWindow.show();
                if (splashWindow) {
                    splashWindow.close();
                }
                if (isDevelopment) mainWindowContent.webContents.openDevTools();
            } catch (err) {
                logger.error('Error showing main window:', err.message);
            }
        });

        mainWindow.on('closed', () => {
            mainWindow = null;
        });
    } catch (err) {
        logger.error('Error creating main window:', err.message);
    }
}

function resizeMainWindow() {
    try {
        mainWindowContent.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height })
        if (overlayList.length > 0) {
            overlayList.forEach(overlay => {
                overlay.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height });
            });
        }

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
                try {
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
                } catch (err) {
                    logger.error('Error updating webpage bounds:', err.message);
                }
            })
            .catch(err => {
                log.error(err);
            });
    } catch (err) {
        logger.error('Error resizing main window:', err.message);
    }
}

async function createTabview(url, isNewTab = false, tabFromDatabase = null) {
    try {
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
            } else if (tabFromDatabase.isErrorPage) {
                tabView.webContents.loadURL(tabFromDatabase.originalURL);
            } else {
                tabView.webContents.loadURL(tabFromDatabase.url);
            }
        }
    } catch (err) {
        logger.error('Error creating tabview:', err.message);
    }
}

function setTabViewEventlisteners(tabView) {
    try {
        //Once the DOM is ready, send a message to initiate some further logic
        tabView.webContents.on('dom-ready', () => {
            try {
                insertRendererCSS();

                const scriptToExecute = path.join(__dirname, '../src/renderer/tabview/render-tabview.js');
                const scriptContent = fs.readFileSync(scriptToExecute, 'utf-8');
                const iframeScriptToExecute = path.join(__dirname, '../src/renderer/tabview/render-iframe.js');
                const iframeScriptContent = fs.readFileSync(iframeScriptToExecute, 'utf-8');

                tabView.webContents.executeJavaScript(scriptContent).then(() => {
                    try {
                        // This event fires when the tabView is attached

                        // If the tab is active, send isActive = true to connect the mutation observer
                        if (tabList.find(tab => tab.webContentsView === tabView && tab.isActive)) {
                            tabView.webContents.send('ipc-main-tabview-loaded', useNavAreas, scrollDistance, true);
                        } else {
                            tabView.webContents.send('ipc-main-tabview-loaded', useNavAreas, scrollDistance, false);
                        }

                        // injecting javascript into each first level iframe of the tabview
                        tabView.webContents.mainFrame.frames.forEach(async (frame) => {
                            if (frame.parent !== null && frame.url !== 'about:blank') { // Only inject into iframes that are not blank
                                try {
                                    await frame.executeJavaScript(iframeScriptContent)
                                } catch (error) {
                                    logger.error("Error injecting into iframe:", error);
                                }
                            }
                        });

                        tabView.webContents.send('ipc-iframes-loaded', scrollDistance);
                    } catch (err) {
                        logger.error('Error during tabview DOM ready processing:', err.message);
                    }
                });

                tabView.webContents.openDevTools(); // to remove
                if (isDevelopment) tabView.webContents.openDevTools();
            } catch (err) {
                logger.error('Error during tabview DOM ready:', err.message);
            }
        });

        //Loading event - update omnibox
        tabView.webContents.on('did-start-loading', () => {
            try {
                // If the event emitted is from the active tab, update the omnibox
                let activeTab = tabList.find(tab => tab.isActive === true);
                if (tabView === activeTab.webContentsView) {
                    mainWindowContent.webContents.send('tabview-loading-start');
                }
            } catch (err) {
                logger.error('Error during tabview start loading:', err.message);
            }
        });

        tabView.webContents.on('did-stop-loading', () => {
            try {
                // If the event emitted is from the active tab, update the omnibox
                let activeTab = tabList.find(tab => tab.isActive === true);
                if (tabView === activeTab.webContentsView) {
                    updateOmnibox();
                }
            } catch (err) {
                logger.error('Error during tabview stop loading:', err.message);
            }
        });

        tabView.webContents.on('did-finish-load', () => {
            try {
                captureSnapshot();
                updateBookmarksIcon();
                clearSidebarAndUpdateQuadTree();
            } catch (err) {
                logger.error('Error during tabview finish load:', err.message);
            }
        });

        tabView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            try {
                if (isMainFrame) {
                    handleLoadError(errorCode, validatedURL);
                }
            } catch (err) {
                logger.error('Error during tabview fail load:', err.message);
            }
        });

        tabView.webContents.on('did-fail-provisional-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            try {
                if (isMainFrame) {
                    handleLoadError(errorCode, validatedURL);
                }
            } catch (err) {
                logger.error('Error during tabview fail provisional load:', err.message);
            }
        });

        tabView.webContents.session.webRequest.onResponseStarted(async (details) => {
            try {
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
                            successfulLoad = true;
                            activeTab.isErrorPage = false;
                            activeTab.originalURL = details.url; // Update the original URL
                            goingToLoadErrorPage = false;
                        } else {
                            // Error detected
                            successfulLoad = false;

                            // When an error occurs, the next page to be loaded is the error page itself which results in a false positive
                            // To prevent this, we set a flag to indicate that the next page to be loaded is an error page
                            if (details.statusCode < 400) {
                                goingToLoadErrorPage = false;
                            } else {
                                // Check if the response body contains a custom error page
                                await tabView.webContents.executeJavaScript(`document.documentElement.innerHTML.trim()`)
                                    .then(responseBody => {
                                        try {
                                            // Check if the response body contains meaningful content
                                            const isEmptyBody = responseBody === "<head></head><body></body>" || !responseBody.trim();

                                            if (!isEmptyBody) {
                                                console.log("Server's custom error page detected");
                                                handleLoadError(details.statusCode, details.url, responseBody);
                                            } else {
                                                console.log("Browser's default error page detected");
                                                handleLoadError(details.statusCode, details.url);
                                            }
                                        } catch (err) {
                                            logger.error('Error processing response body:', err.message);
                                        }
                                    }).catch(error => {
                                        logger.error("Error reading response body:", error);
                                        handleLoadError(details.statusCode, details.url);
                                    });
                            }
                        }
                    }
                }
            } catch (err) {
                logger.error('Error during response started:', err.message);
            }
        });

        //React to in-page navigation (e.g. anchor links)
        tabView.webContents.on('did-navigate-in-page', (event, url) => {
            try {
                const anchorTag = url.split('#')[1];
                if (anchorTag) {
                    tabView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
                }
            } catch (err) {
                logger.error('Error during in-page navigation:', err.message);
            }
        });

        tabView.webContents.setWindowOpenHandler(({ url }) => {
            try {
                createTabview(url, isNewTab = true);
            } catch (err) {
                logger.error('Error during window open handler:', err.message);
            }
        });
    } catch (err) {
        logger.error('Error setting tabview event listeners:', err.message);
    }
}

function handleLoadError(errorCode, attemptedURL, responseBody = null) {
    try {
        // Storing the active tab's original URL before the error page is loaded.
        let activeTab = tabList.find(tab => tab.isActive === true);
        activeTab.originalURL = attemptedURL;
        activeTab.isErrorPage = true;

        if (!responseBody) {
            // If the server does not respond with a custom error page, load the browser's error page instead
            activeTab.webContentsView.webContents.loadURL(path.join(__dirname, '../src/pages/error.html')).then(() => {
                try {
                    activeTab.webContentsView.webContents.executeJavaScript(`    
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
                                errorTitle.textContent = 'Address Not Found';
                                errorMessage.textContent = 'DNS Error. The website address could not be found.';
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
                } catch (err) {
                    logger.error('Error during error page processing:', err.message);
                }
            });
        }
    } catch (err) {
        logger.error('Error handling load error:', err.message);
    }
}

function updateOmnibox() {
    try {
        let activeTab = tabList.find(tab => tab.isActive === true);
        let pageDetails = {
            title: activeTab.webContentsView.webContents.getTitle(),
            url: activeTab.webContentsView.webContents.getURL(),
            isErrorPage: activeTab.isErrorPage,
            successfulLoad: successfulLoad,
        }
        mainWindowContent.webContents.send('tabview-loading-stop', pageDetails);
    } catch (err) {
        logger.error('Error updating omnibox:', err.message);
    }
}

function updateBookmarksIcon() {
    try {
        let activeTab = tabList.find(tab => tab.isActive === true);
        let activeURL = activeTab.webContentsView.webContents.getURL();
        let isBookmark = bookmarks.some(bookmark => bookmark.url === activeURL);
        mainWindowContent.webContents.send('ipc-main-update-bookmark-icon', isBookmark);
    } catch (err) {
        logger.error('Error updating bookmarks icon:', err.message);
    }
}

function clearSidebarAndUpdateQuadTree() {
    try {
        mainWindowContent.webContents.send('ipc-mainwindow-clear-sidebar');
        tabList.find(tab => tab.isActive === true).webContentsView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
    } catch (err) {
        logger.error('Error clearing sidebar and updating quadtree:', err.message);
    }
}

function setTabViewEventlistenersAndLoadURL(tab) {
    try {
        // If the selected tab has set its event handlers yet, set them - This is to prevent the event handlers from being set multiple times
        // and for the JS and CSS to be injected only once it is the active tab.
        if (tab.setEventHandlers) {
            setTabViewEventlisteners(tab.webContentsView);
            tab.setEventHandlers = false;

            if (tab.isErrorPage) {
                tab.webContentsView.webContents.loadURL(tab.originalURL);
            } else {
                tab.webContentsView.webContents.loadURL(tab.url);
            }
        }
    } catch (err) {
        logger.error('Error setting tabview event listeners and loading URL:', err.message);
    }
}

function slideUpView(view, duration = 170) {
    try {
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
            try {
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
            } catch (err) {
                logger.error('Error during slide up view:', err.message);
            }
        }, interval);
    } catch (err) {
        logger.error('Error sliding up view:', err.message);
    }
}

function slideInView(view, duration = 200) {
    try {
        const fps = 120; // High frame rate for smoothness
        const interval = 1000 / fps;
        const steps = Math.ceil(duration / interval);

        const initialX = view.getBounds().x;
        const finalX = webpageBounds.x;

        const deltaX = (finalX - initialX) / steps;

        let currentX = initialX;
        let step = 0;

        const intervalId = setInterval(() => {
            try {
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
            } catch (err) {
                logger.error('Error during slide in view:', err.message);
            }
        }, interval);
    } catch (err) {
        logger.error('Error sliding in view:', err.message);
    }
}

function insertRendererCSS() {
    try {
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
                color: #bad727;
                opacity: 0.4;
                z-index: 9999999999;
                position: absolute;
                margin: -20px 0 0 -20px;
                pointer-events: none;
                mix-blend-mode: difference; 
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
    } catch (err) {
        logger.error('Error inserting renderer CSS:', err.message);
    }
}

async function captureSnapshot() {
    try {
        return new Promise((resolve, reject) => {
            var tab = tabList.find(tab => tab.isActive === true);
            if (tab && tab.webContentsView && tab.webContentsView.webContents) {
                tab.webContentsView.webContents.capturePage().then(snapshot => {
                    tab.snapshot = snapshot.toDataURL();
                    resolve();
                }).catch(err => {
                    logger.error('Error capturing snapshot:', err.message);
                    reject(err);
                });
            } else {
                reject(new Error('Active tab or webContents not available for capture'));
            }
        }).catch(err => {
            logger.error('Error in captureSnapshot:', err.message);
        });
    } catch (err) {
        logger.error('Error capturing snapshot:', err.message);
    }
}

function removeOverlay() {
    try {
        if (overlayList.length > 0) {
            mainWindow.contentView.removeChildView(overlayList[overlayList.length - 1]);
            overlayList.pop();
            isKeyboardOverlay = null;
        }
    } catch (err) {
        logger.error('Error removing overlay:', err.message);
    }
}

async function createOverlay(overlayAreaToShow, elementProperties, isTransparent = false) {
    try {
        let mainWindowContentBounds = mainWindow.getContentBounds();
        let renderer = overlayAreaToShow === 'keyboard' ? 'render-overlay-keyboard.js' : 'render-overlay-menus.js';
        let htmlPage = overlayAreaToShow === 'keyboard' ? 'keyboard.html' : 'overlays.html';

        let overlayContent = new WebContentsView({
            //https://www.electronjs.org/docs/latest/tutorial/security
            webPreferences: {
                nodeIntegrationInWorker: true,
                contextIsolation: true,
                preload: path.join(__dirname, '../src/renderer/overlays/', renderer),
                transparent: isTransparent,
            },
        })
        overlayList.push(overlayContent);

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
            dwellTime: dwellTime,
            quickDwellRange: quickDwellRange,
            settings: [],
        };

        switch (overlayAreaToShow) {
            case 'keyboard':
                let keyboardLayout = await db.getDefaultLayout();
                overlayContent.webContents.send('ipc-main-keyboard-loaded', elementProperties, keyboardLayout, keyboardDwellTime);
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

            case 'settings':
                overlaysData.settings = {
                    defaultUrl: {
                        value: defaultUrl,
                        label: Settings.DEFAULT_URL.LABEL,
                        description: Settings.DEFAULT_URL.DESCRIPTION,
                        category: 'General Settings'
                    },
                    defaultLanguage: {
                        value: await db.getDefaultLayout(),
                        label: Settings.DEFAULT_LAYOUT.LABEL,
                        description: Settings.DEFAULT_LAYOUT.DESCRIPTION,
                        options: [
                            { label: 'ENGLISH', value: KeyboardLayouts.ENGLISH },
                            { label: 'FRENCH', value: KeyboardLayouts.FRENCH },
                            { label: 'ITALIAN', value: KeyboardLayouts.ITALIAN },
                            { label: 'MALTESE', value: KeyboardLayouts.MALTESE }
                        ],
                        category: 'General Settings'
                    },
                    dwellTime: {
                        value: dwellTime,
                        label: Settings.DWELL_TIME.LABEL,
                        description: Settings.DWELL_TIME.DESCRIPTION,
                        options: [
                            { label: `${Settings.DWELL_TIME.VERY_SHORT / 1000} s`, value: Settings.DWELL_TIME.VERY_SHORT },
                            { label: `${Settings.DWELL_TIME.SHORT / 1000} s`, value: Settings.DWELL_TIME.SHORT },
                            { label: `${Settings.DWELL_TIME.NORMAL / 1000} s`, value: Settings.DWELL_TIME.NORMAL },
                            { label: `${Settings.DWELL_TIME.LONG / 1000} s`, value: Settings.DWELL_TIME.LONG },
                            { label: `${Settings.DWELL_TIME.VERY_LONG / 1000} s`, value: Settings.DWELL_TIME.VERY_LONG }
                        ],
                        category: 'Dwell Settings'
                    },
                    keyboardDwellTime: {
                        value: keyboardDwellTime,
                        label: Settings.KEYBOARD_DWELL_TIME.LABEL,
                        description: Settings.KEYBOARD_DWELL_TIME.DESCRIPTION,
                        options: [
                            { label: `${Settings.KEYBOARD_DWELL_TIME.VERY_SHORT / 1000} s`, value: Settings.KEYBOARD_DWELL_TIME.VERY_SHORT },
                            { label: `${Settings.KEYBOARD_DWELL_TIME.SHORT / 1000} s`, value: Settings.KEYBOARD_DWELL_TIME.SHORT },
                            { label: `${Settings.KEYBOARD_DWELL_TIME.NORMAL / 1000} s`, value: Settings.KEYBOARD_DWELL_TIME.NORMAL },
                            { label: `${Settings.KEYBOARD_DWELL_TIME.LONG / 1000} s`, value: Settings.KEYBOARD_DWELL_TIME.LONG },
                            { label: `${Settings.KEYBOARD_DWELL_TIME.VERY_LONG / 1000} s`, value: Settings.KEYBOARD_DWELL_TIME.VERY_LONG }
                        ],
                        category: 'Dwell Settings'
                    },
                    scrollDistance: {
                        value: scrollDistance,
                        label: Settings.TAB_VIEW_SCROLL_DISTANCE.LABEL,
                        description: Settings.TAB_VIEW_SCROLL_DISTANCE.DESCRIPTION,
                        options: [
                            { label: 'SLOW', value: Settings.TAB_VIEW_SCROLL_DISTANCE.SLOW },
                            { label: 'NORMAL', value: Settings.TAB_VIEW_SCROLL_DISTANCE.NORMAL },
                            { label: 'FAST', value: Settings.TAB_VIEW_SCROLL_DISTANCE.FAST }
                        ],
                        category: 'Scrolling Settings'
                    },
                    menuAreaScrollDistance: {
                        value: menuAreaScrollDistance,
                        label: Settings.MENU_AREA_SCROLL_DISTANCE.LABEL,
                        description: Settings.MENU_AREA_SCROLL_DISTANCE.DESCRIPTION,
                        options: [
                            { label: 'SLOW', value: Settings.MENU_AREA_SCROLL_DISTANCE.SLOW },
                            { label: 'NORMAL', value: Settings.MENU_AREA_SCROLL_DISTANCE.NORMAL },
                            { label: 'FAST', value: Settings.MENU_AREA_SCROLL_DISTANCE.FAST }
                        ],
                        category: 'Scrolling Settings'
                    },
                }
                break;
        }

        if (!isKeyboardOverlay) overlayContent.webContents.send('ipc-main-overlays-loaded', overlaysData);

        if (isDevelopment) overlayContent.webContents.openDevTools();
        overlayContent.webContents.openDevTools(); // to remove
    } catch (err) {
        logger.error('Error creating overlay:', err.message);
    }
}

async function registerSwitchShortcutCommands() {
    try {
        const shortcuts = await db.getShortcuts();

        const shortcutActions = [
            { action: Shortcuts.CLICK, handler: () => handleClickShortcut() },
            { action: Shortcuts.TOGGLE_OMNI_BOX, handler: () => handleToggleOmniBoxShortcut() },
            { action: Shortcuts.SIDEBAR_SCROLL_UP, handler: () => handleSidebarScrollUpShortcut() },
            { action: Shortcuts.SIDEBAR_SCROLL_DOWN, handler: () => handleSidebarScrollDownShortcut() },
            { action: Shortcuts.NAVIGATE_FORWARD, handler: () => handleNavigateForwardShortcut() },
            { action: Shortcuts.NAVIGATE_BACK, handler: () => handleNavigateBackShortcut() },
            { action: Shortcuts.TOGGLE_DWELLING, handler: () => handleToggleDwellingShortcut() },
            { action: Shortcuts.ZOOM_IN, handler: () => handleZoomInShortcut() },
            { action: Shortcuts.ZOOM_OUT, handler: () => handleZoomOutShortcut() },
        ];

        shortcutActions.forEach(({ action, handler }) => {
            const shortcut = shortcuts.find(s => s.action === action);
            if (shortcut) {
                globalShortcut.register(shortcut.shortcut, handler);
            }
        });
    } catch (err) {
        logger.error('Error registering shortcut commands:', err.message);
    }
}

function handleClickShortcut() {
    try {
        robot.mouseClick();
    } catch (err) {
        logger.error('Error handling click shortcut:', err.message);
    }
}

function handleToggleOmniBoxShortcut() {
    try {
        if (overlayList.length > 0 && isKeyboardOverlay) {
            removeOverlay();
        } else {
            mainWindowContent.webContents.send('ipc-mainwindow-load-omnibox');
        }
    } catch (err) {
        logger.error('Error toggling omnibox shortcut:', err.message);
    }
}

function handleSidebarScrollUpShortcut() {
    try {
        mainWindowContent.webContents.send('ipc-main-sidebar-scrollup');
    } catch (err) {
        logger.error('Error handling sidebar scroll up shortcut:', err.message);
    }
}

function handleSidebarScrollDownShortcut() {
    try {
        mainWindowContent.webContents.send('ipc-main-sidebar-scrolldown');
    } catch (err) {
        logger.error('Error handling sidebar scroll down shortcut:', err.message);
    }
}

function handleNavigateForwardShortcut() {
    try {
        console.log("Navigate forward shortcut triggered");
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-forward');
    } catch (err) {
        logger.error('Error handling navigate forward shortcut:', err.message);
    }
}

function handleNavigateBackShortcut() {
    try {
        console.log("Navigate back shortcut triggered");
        var tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.send('ipc-tabview-back');
    } catch (err) {
        logger.error('Error handling navigate back shortcut:', err.message);
    }
}

function handleToggleDwellingShortcut() {
    try {
        toggleDwelling();
    } catch (err) {
        logger.error('Error handling toggle dwelling shortcut:', err.message);
    }
}

function handleZoomInShortcut() {
    try {
        handleZoom("in", false);
    } catch (err) {
        logger.error('Error handling zoom in shortcut:', err.message);
    }
}

function handleZoomOutShortcut() {
    try {
        handleZoom("out", false);
    } catch (err) {
        logger.error('Error handling zoom out shortcut:', err.message);
    }
}

async function toggleDwelling() {
    try {
        isDwellingActive = !isDwellingActive
        mainWindowContent.webContents.send('ipc-mainwindow-handle-dwell-events', isDwellingActive);
        await db.updateUserSetting(Settings.IS_DWELLING_ACTIVE.NAME, isDwellingActive);
    } catch (err) {
        logger.error('Error toggling dwelling:', err.message);
    }
}

async function toggleNavigation() {
    try {
        useNavAreas = !useNavAreas;
        tabList.forEach(tab => {
            tab.webContentsView.webContents.send('ipc-tabview-create-quadtree', useNavAreas);
        });
        await db.updateUserSetting(Settings.USE_NAV_AREAS.NAME, useNavAreas);
    } catch (err) {
        logger.error('Error toggling navigation:', err.message);
    }
}

async function toggleUseRobotJS() {
    try {
        useRobotJS = !useRobotJS;
        await db.updateUserSetting(Settings.USE_ROBOT_JS.NAME, useRobotJS);
    } catch (err) {
        logger.error('Error toggling RobotJS:', err.message);
    }
}

function handleZoom(direction, closeOverlay = true) {
    try {
        const MIN_ZOOM_LEVEL = -7;
        const MAX_ZOOM_LEVEL = 7;

        const tab = tabList.find(tab => tab.isActive === true);
        let zoomLevel = tab.webContentsView.webContents.getZoomLevel();

        // When the shortcut is used to zoom in/out, then any time the zoom factor reaches the min/max value, it will reset to 1.0.
        // This creates a loop of zooming in/out when the user keeps pressing the shortcut.
        switch (direction) {
            case "in":
                zoomLevel = ((zoomLevel >= MAX_ZOOM_LEVEL) && closeOverlay) ? 0 : zoomLevel + 1;
                break;
            case "out":
                zoomLevel = ((zoomLevel <= MIN_ZOOM_LEVEL) && closeOverlay) ? 0 : zoomLevel - 1;
                break;
            case "reset":
                zoomLevel = 0;
                break;
        }

        tab.webContentsView.webContents.setZoomLevel(zoomLevel);
        tab.webContentsView.webContents.send('ipc-tabview-create-quadtree', useNavAreas); // Updating the quadtree after zooming
        if (closeOverlay) removeOverlay();
    } catch (err) {
        logger.error('Error handling zoom:', err.message);
    }
}

function createHTMLSerializableMenuElement(element) {
    try {
        // Mapping each child element to a serializable menu element
        element.children = element.children.map(child => createHTMLSerializableMenuElement(child));
        return new HTMLSerializableMenuElement(element);
    } catch (err) {
        logger.error('Error creating HTML serializable menu element:', err.message);
    }
}

async function robotClick(x, y) {
    try {
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
    } catch (err) {
        logger.error('Error during robot mouse click:', err.message);
    }
}

function browseToUrl(url) {
    try {
        const fullUrl = getFullURL(url);
        let tab = tabList.find(tab => tab.isActive === true);
        tab.webContentsView.webContents.loadURL(fullUrl);
    } catch (err) {
        logger.error('Error browsing to URL:', err.message);
    }
}

function getFullURL(url) {
    try {
        let fullUrl;

        if (url) {
            //Assume all is ok
            fullUrl = url;
            var tab = tabList.find(tab => tab.isActive === true);
            const currentURL = new URL(tab.webContentsView.webContents.getURL());
            const protocol = currentURL.protocol;

            //Handle URLs without protocol (e.g. //www.google.com)
            if (url.startsWith('//')) {
                fullUrl = protocol + url;
            } else if (url.startsWith('/') || url.startsWith('../') || url.startsWith('./')) {
                //Handle relative path URLs (e.g. /path/to/resource)
                fullUrl = new URL(url, currentURL).href;
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
    } catch (err) {
        logger.error('Error getting full URL:', err.message);
    }
}


// =================================
// ====== DATABASE FUNCTIONS =======
// =================================

async function addBookmarkToDatabase(bookmark){
    try {
        await db.addBookmark(bookmark);
    } catch (err) {
        logger.error('Error adding bookmark to database:', err.message);
    }
}

async function deleteBookmarkByUrl(url){
    try {
        await db.deleteBookmarkByUrl(url);
    } catch (err) {
        logger.error('Error removing bookmark from database:', err.message);
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
        logger.error('Error updating database with open tabs:', err.message);
    }
}
