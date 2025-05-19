const { app } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Settings, Shortcuts } = require('../src/tools/enums.js');
const dbPath = path.join(app.getPath('userData'), 'cactus.db');

let db;

function connect() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.log(`Error connecting to the database: ${err.message}, dbPath: ${dbPath}`);
                reject(err);
            } else {
                console.log('Connected to the SQLite database.');
                resolve(db);
            }
        });
    });
}

function close() {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close((err) => {
                if (err) {
                    console.error('Error closing the database:', err.message);
                    reject(err);
                } else {
                    console.log('Database connection closed.');
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

// =================================
// ======== CREATING TABLES ========
// =================================

function createBookmarksTable() {
    return new Promise((resolve, reject) => {
        const createBookmarksTable = `
            CREATE TABLE IF NOT EXISTS bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                snapshot BLOB NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        db.run(createBookmarksTable, (err) => {
            if (err) {
                console.error('Error creating bookmarks table:', err.message);
                reject(err);
            } else {
                console.log('Bookmarks table created successfully.');
                resolve();
            }
        });
    });
}

function createTabsTable() {
    return new Promise((resolve, reject) => {
        const createTabsTable = `
            CREATE TABLE IF NOT EXISTS tabs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT,
                title TEXT NOT NULL,
                isActive BOOLEAN NOT NULL,
                snapshot BLOB NOT NULL,
                originalURL TEXT,
                isErrorPage BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        db.run(createTabsTable, (err) => {
            if (err) {
                console.error('Error creating tabs table:', err.message);
                reject(err);
            } else {
                console.log('Tabs table created successfully.');
                resolve();
            }
        });
    });
}

function createShortcutsTable() {
    return new Promise((resolve, reject) => {
        const createShortcutsTable = `
            CREATE TABLE IF NOT EXISTS shortcuts (
                action TEXT PRIMARY KEY,
                shortcut TEXT NOT NULL
            );
        `;
        db.run(createShortcutsTable, (err) => {
            if (err) {
                console.error('Error creating shortcuts table:', err.message);
                reject(err);
            } else {
                console.log('Shortcuts table created successfully.');
                resolve();
            }
        });
    });
}

function populateShortcutsTable() {
    return new Promise((resolve, reject) => {
        const shortcuts = {
            [Shortcuts.ACTIONS.CLICK.NAME]:                 Shortcuts.ACTIONS.CLICK.HOTKEYS,
            [Shortcuts.ACTIONS.TOGGLE_OMNI_BOX.NAME]:       Shortcuts.ACTIONS.TOGGLE_OMNI_BOX.HOTKEYS,
            [Shortcuts.ACTIONS.TOGGLE_READ_MODE.NAME]:       Shortcuts.ACTIONS.TOGGLE_READ_MODE.HOTKEYS,
            [Shortcuts.ACTIONS.ZOOM_IN.NAME]:               Shortcuts.ACTIONS.ZOOM_IN.HOTKEYS,
            [Shortcuts.ACTIONS.ZOOM_OUT.NAME]:              Shortcuts.ACTIONS.ZOOM_OUT.HOTKEYS,
            [Shortcuts.ACTIONS.SIDEBAR_SCROLL_UP.NAME]:     Shortcuts.ACTIONS.SIDEBAR_SCROLL_UP.HOTKEYS,
            [Shortcuts.ACTIONS.SIDEBAR_SCROLL_DOWN.NAME]:   Shortcuts.ACTIONS.SIDEBAR_SCROLL_DOWN.HOTKEYS,
            [Shortcuts.ACTIONS.NAVIGATE_FORWARD.NAME]:      Shortcuts.ACTIONS.NAVIGATE_FORWARD.HOTKEYS,
            [Shortcuts.ACTIONS.NAVIGATE_BACK.NAME]:         Shortcuts.ACTIONS.NAVIGATE_BACK.HOTKEYS
        };
        const insertShortcut = `
            INSERT OR IGNORE INTO shortcuts (action, shortcut)
            VALUES (?, ?)
        `;
        const shortcutPromises = Object.entries(shortcuts).map(([action, shortcut]) => {
            return new Promise((resolve, reject) => {
                db.run(insertShortcut, [action, shortcut], function(err) {
                    if (err) {
                        console.error(`Error inserting shortcut for action ${action}:`, err.message);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
        Promise.all(shortcutPromises)
            .then(() => {
                console.log('Shortcuts table populated successfully.');
                resolve();
            })
            .catch((err) => {
                console.error('Error populating shortcuts table:', err.message);
                reject(err);
            });
    });
}

function createUserSettingsTable() {
    return new Promise((resolve, reject) => {
        const createUserSettingsTable = `
            CREATE TABLE IF NOT EXISTS user_settings (
                setting TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `;
        db.run(createUserSettingsTable, (err) => {
            if (err) {
                console.error('Error creating user settings table:', err.message);
                reject(err);
            } else {
                console.log('User settings table created successfully.');
                resolve();
            }
        });
    });
}

function populateUserSettingsTable() {
    return new Promise((resolve, reject) => {
        const defaultSettings = {
            [Settings.DWELL_TIME.NAME]:                         Settings.DWELL_TIME.NORMAL,
            [Settings.DWELL_RANGE.NAME]:                        Settings.DWELL_RANGE.DEFAULT,
            [Settings.KEYBOARD_DWELL_TIME.NAME]:                Settings.KEYBOARD_DWELL_TIME.SHORT,
            [Settings.RANGE_WIDTH.NAME]:                        Settings.RANGE_WIDTH.DEFAULT,
            [Settings.RANGE_HEIGHT.NAME]:                       Settings.RANGE_HEIGHT.DEFAULT,
            [Settings.TAB_VIEW_SCROLL_DISTANCE.NAME]:           Settings.TAB_VIEW_SCROLL_DISTANCE.NORMAL,
            [Settings.MENU_AREA_SCROLL_DISTANCE.NAME]:          Settings.MENU_AREA_SCROLL_DISTANCE.NORMAL,
            [Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS.NAME]:    Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS.DEFAULT,
            [Settings.USE_NAV_AREAS.NAME]:                      Settings.USE_NAV_AREAS.DEFAULT,
            [Settings.USE_ROBOT_JS.NAME]:                       Settings.USE_ROBOT_JS.DEFAULT,
            [Settings.IS_READ_MODE_ACTIVE.NAME]:                Settings.IS_READ_MODE_ACTIVE.DEFAULT,
            [Settings.DEFAULT_URL.NAME]:                        Settings.DEFAULT_URL.DEFAULT,
            [Settings.DEFAULT_LAYOUT.NAME]:                     Settings.DEFAULT_LAYOUT.DEFAULT,
            [Settings.PREVIOUS_APP_VERSION.NAME]:               Settings.PREVIOUS_APP_VERSION.DEFAULT,
        };
        const insertSetting = `
            INSERT OR IGNORE INTO user_settings (setting, value)
            VALUES (?, ?)
        `;
        const settingPromises = Object.entries(defaultSettings).map(([setting, value]) => {
            return new Promise((resolve, reject) => {
                db.run(insertSetting, [setting, value.toString()], function(err) {
                    if (err) {
                        console.error(`Error inserting setting for setting ${setting}:`, err.message);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
        Promise.all(settingPromises)
            .then(() => {
                console.log('User settings table populated successfully.');
                resolve();
            })
            .catch((err) => {
                console.error('Error populating user settings table:', err.message);
                reject(err);
            });
    });
}

async function createTables() {
    return createBookmarksTable()
        .then(createTabsTable)
        .then(createShortcutsTable)
        .then(populateShortcutsTable)
        .then(createUserSettingsTable)
        .then(populateUserSettingsTable)
        .catch((err) => {
            console.error('Error creating tables:', err.message);
            throw err;
        });
}

// =================================
// ============ ADDING =============
// =================================

function addBookmark({url, title, snapshot}) {
    try {
        // Converting base64 image to buffer
        let base64Data = snapshot.replace(/^data:image\/\w+;base64,/, "");
        let binarySnapshot = Buffer.from(base64Data, "base64");

        return new Promise((resolve, reject) => {
            const insertBookmark = `
                INSERT INTO bookmarks (url, title, snapshot)
                VALUES (?, ?, ?)
            `;
            db.run(insertBookmark, [url, title, binarySnapshot], function(err) {
                if (err) {
                    console.error('Error inserting bookmark:', err.message);
                    reject(err);
                } else {
                    console.log(`A bookmark has been inserted with rowid ${this.lastID}`);
                    resolve(this.lastID);
                }
            });
        });
    } catch (err) {
        console.error('Error adding bookmark:', err.message);
    }
}

function addTab({url, title, isActive, snapshot, originalURL, isErrorPage}) {
    try {
        // Converting base64 image to buffer
        let base64Data = snapshot.replace(/^data:image\/\w+;base64,/, "");
        let binarySnapshot = Buffer.from(base64Data, "base64");

        return new Promise((resolve, reject) => {
            const insertTab = `
                INSERT INTO tabs (url, title, isActive, snapshot, originalURL, isErrorPage)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            db.run(insertTab, [url, title, isActive, binarySnapshot, originalURL, isErrorPage], function(err) {
                if (err) {
                    console.error('Error inserting tab:', err.message);
                    reject(err);
                } else {
                    console.log(`A tab has been inserted with rowid ${this.lastID}`);
                    resolve(this.lastID);
                }
            });
        });
    } catch (err) {
        console.error('Error adding tab:', err.message);
    }
}

// =================================
// =========== REMOVING ============
// =================================

function deleteBookmarkByUrl(url) {
    return new Promise((resolve, reject) => {
        const deleteBookmark = `DELETE FROM bookmarks WHERE url = ?`;
        db.run(deleteBookmark, [url], function(err) {
            if (err) {
                console.error('Error deleting bookmark:', err.message);
                reject(err);
            } else {
                console.log(`Bookmark with URL: ${url} has been deleted`);
                resolve();
            }
        });
    });
}

function deleteAllTabs() {
    return new Promise((resolve, reject) => {
        const deleteTabs = `DELETE FROM tabs`;
        db.run(deleteTabs, function(err) {
            if (err) {
                console.error('Error deleting all tabs:', err.message);
                reject(err);
            } else {
                console.log('All tabs have been deleted');
                resolve();
            }
        });
    });
}

// =================================
// ============ GETTERS ============
// =================================

function getBookmarks() {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM bookmarks`;
        db.all(query, (err, rows) => {
            if (err) {
                console.error('Error retrieving bookmarks:', err.message);
                reject(err);
            } else {
                // Convert each snapshot (BLOB) to a Base64 string
                rows.forEach(row => {
                    if (row.snapshot) {
                        row.snapshot = `data:image/png;base64,${row.snapshot.toString("base64")}`;
                    }
                });

                resolve(rows);
            }
        });
    }).catch(err => {
        console.error('Error getting bookmarks:', err.message);
    });
}

function getTabs() {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM tabs`;
        db.all(query, (err, rows) => {
            if (err) {
                console.error('Error retrieving tabs:', err.message);
                reject(err);
            } else {
                // Convert each snapshot (BLOB) to a Base64 string if snapshot is present
                rows.forEach(row => {
                    if (row.snapshot) {
                        row.snapshot = `data:image/png;base64,${row.snapshot.toString("base64")}`;
                    }
                });

                resolve(rows);
            }
        });
    }).catch(err => {
        console.error('Error getting tabs:', err.message);
    });
}

function getShortcuts() {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM shortcuts`;
        db.all(query, (err, rows) => {
            if (err) {
                console.error('Error retrieving shortcuts:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    }).catch(err => {
        console.error('Error getting shortcuts:', err.message);
    });
}

function getSetting(setting) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const query = `SELECT value FROM user_settings WHERE setting = ?`;
        db.get(query, [setting], (err, row) => {
            if (err) {
                console.error(`Error retrieving ${setting}:`, err.message);
                reject(err);
            } else {
                resolve(row.value);
            }
        });
    }).catch(err => {
        console.error(`Error getting ${setting}:`, err.message);
    });
}

function getDefaultURL() {
    return getSetting(Settings.DEFAULT_URL.NAME);
}

function getDwellRangeWidth() {
    return getSetting(Settings.RANGE_WIDTH.NAME).then(value => parseInt(value, 10));
}

function getDwellRangeHeight() {
    return getSetting(Settings.RANGE_HEIGHT.NAME).then(value => parseInt(value, 10));
}

function getActivateNavAreas() {
    return getSetting(Settings.USE_NAV_AREAS.NAME).then(value => value === '1');
}

function getUseRobotJS() {
    return getSetting(Settings.USE_ROBOT_JS.NAME).then(value => value === '1');
}

function getIsReadModeActive() {
    return getSetting(Settings.IS_READ_MODE_ACTIVE.NAME).then(value => value === '1');
}

function getTabScrollDistance() {
    return getSetting(Settings.TAB_VIEW_SCROLL_DISTANCE.NAME).then(value => parseInt(value, 10));
}

function getMenuScrollDistance() {
    return getSetting(Settings.MENU_AREA_SCROLL_DISTANCE.NAME).then(value => parseInt(value, 10));
}

function getDwellTime() {
    return getSetting(Settings.DWELL_TIME.NAME).then(value => parseInt(value, 10));
}

function getQuickDwellRange() {
    return getSetting(Settings.DWELL_RANGE.NAME).then(value => parseInt(value, 10));
}

function getKeyboardDwellTime() {
    return getSetting(Settings.KEYBOARD_DWELL_TIME.NAME).then(value => parseInt(value, 10));
}

function getMenuScrollInterval() {
    return getSetting(Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS.NAME).then(value => parseInt(value, 10));
}

function getDefaultLayout() {
    return getSetting(Settings.DEFAULT_LAYOUT.NAME);
}

function getPreviousAppVersion() {
    return getSetting(Settings.PREVIOUS_APP_VERSION.NAME);
}

// =================================
// =========== UPDATING ============
// =================================

function updateUserSetting(setting, value) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const query = `UPDATE user_settings SET value = ? WHERE setting = ?`;
        db.run(query, [value, setting], function (err) {
            if (err) {
                console.error(`Error updating setting ${setting}:`, err.message);
                reject(err);
            } else {
                console.log(`The setting '${setting}' has been successfully updated to ${value}`);
                resolve();
            }
        });
    }).catch(err => {
        console.error(`Error in updateUserSetting for ${setting}:`, err.message);
    });
}

function updateDefaultURL(value) {
    if (typeof value !== 'string') {
        throw new Error('Default URL must be a string');
    }
    return updateUserSetting(Settings.DEFAULT_URL.NAME, value);
}

function updateDwellRangeWidth(value) {
    if (typeof value !== 'number') {
        throw new Error('Range width must be a number');
    }
    return updateUserSetting(Settings.RANGE_WIDTH.NAME, value);
}

function updateDwellRangeHeight(value) {
    if (typeof value !== 'number') {
        throw new Error('Range height must be a number');
    }
    return updateUserSetting(Settings.RANGE_HEIGHT.NAME, value);
}

function updateActivateNavAreas(value) {
    if (typeof value !== 'boolean') {
        throw new Error('Activate Nav Areas must be a boolean');
    }
    return updateUserSetting(Settings.USE_NAV_AREAS.NAME, value ? 1 : 0);
}

function updateUseRobotJS(value) {
    if (typeof value !== 'boolean') {
        throw new Error('Use RobotJS must be a boolean');
    }
    return updateUserSetting(Settings.USE_ROBOT_JS.NAME, value ? 1 : 0);
}

function updateIsDwellingActive(value) {
    if (typeof value !== 'boolean') {
        throw new Error('Is Dwelling Active must be a boolean');
    }
    return updateUserSetting(Settings.IS_READ_MODE_ACTIVE.NAME, value ? 1 : 0);
}

function updateTabScrollDistance(value) {
    if (typeof value !== 'number') {
        throw new Error('Tab Scroll Distance must be a number');
    }
    return updateUserSetting(Settings.TAB_VIEW_SCROLL_DISTANCE.NAME, value);
}

function updateMenuScrollDistance(value) {
    if (typeof value !== 'number') {
        throw new Error('Menu Scroll Distance must be a number');
    }
    return updateUserSetting(Settings.MENU_AREA_SCROLL_DISTANCE.NAME, value);
}

function updateDwellTime(value) {
    if (typeof value !== 'number') {
        throw new Error('Dwell Time must be a number');
    }
    return updateUserSetting(Settings.DWELL_TIME.NAME, value);
}

function updateQuickDwellRange(value) {
    if (typeof value !== 'number') {
        throw new Error('Dwell Range must be a number');
    }
    return updateUserSetting(Settings.DWELL_RANGE.NAME, value);
}

function updateKeyboardDwellTime(value) {
    if (typeof value !== 'number') {
        throw new Error('Keyboard Dwell Time must be a number');
    }
    return updateUserSetting(Settings.KEYBOARD_DWELL_TIME.NAME, value);
}

function updateMenuScrollInterval(value) {
    if (typeof value !== 'number') {
        throw new Error('Menu Scroll Interval must be a number');
    }
    return updateUserSetting(Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS.NAME, value);
}

function updateDefaultLayout(value) {
    if (typeof value !== 'string') {
        throw new Error('Default Layout must be a string');
    }
    return updateUserSetting(Settings.DEFAULT_LAYOUT.NAME, value);
}

function updatePreviousAppVersion(version) {
    if (typeof version !== 'string') {
        throw new Error('App version must be a string');
    }
    return updateUserSetting(Settings.PREVIOUS_APP_VERSION.NAME, version);
}


module.exports = {
    connect,
    close,
    createTables,

    addBookmark,
    addTab,

    getBookmarks,
    getTabs,
    getShortcuts,
    getDefaultURL,
    getDefaultLayout,
    getDwellRangeWidth,
    getDwellRangeHeight,
    getActivateNavAreas,
    getUseRobotJS,
    getIsReadModeActive,
    getTabScrollDistance,
    getMenuScrollDistance,
    getMenuScrollInterval,
    getDwellTime,
    getQuickDwellRange,
    getKeyboardDwellTime,
    getPreviousAppVersion,

    deleteBookmarkByUrl,
    deleteAllTabs,

    updateUserSetting,
    updateDefaultURL,
    updateDwellRangeWidth,
    updateDwellRangeHeight,
    updateActivateNavAreas,
    updateUseRobotJS,
    updateIsDwellingActive,
    updateTabScrollDistance,
    updateMenuScrollDistance,
    updateDwellTime,
    updateQuickDwellRange,
    updateKeyboardDwellTime,
    updateMenuScrollInterval,
    updateDefaultLayout,
    updatePreviousAppVersion,
};