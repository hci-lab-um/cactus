const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Settings, Shortcuts } = require('../src/tools/enums.js');
const dbPath = path.join(__dirname, 'cactus.db');

let db;

function connect() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error connecting to the database:', err.message);
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
            [Shortcuts.CLICK]: "CommandOrControl+Alt+C",
            [Shortcuts.TOGGLE_OMNI_BOX]: "CommandOrControl+Alt+O",
            [Shortcuts.TOGGLE_DWELLING]: "CommandOrControl+Alt+D",
            [Shortcuts.ZOOM_IN]: "CommandOrControl+Alt+Plus",
            [Shortcuts.ZOOM_OUT]: "CommandOrControl+Alt+-",
            [Shortcuts.SIDEBAR_SCROLL_UP]: "CommandOrControl+Alt+W",
            [Shortcuts.SIDEBAR_SCROLL_DOWN]: "CommandOrControl+Alt+S",
            [Shortcuts.NAVIGATE_FORWARD]: "CommandOrControl+Alt+Right",
            [Shortcuts.NAVIGATE_BACK]: "CommandOrControl+Alt+Left"
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
            [Settings.DWELL_TIME]: 1500,
            [Settings.KEYBOARD_DWELL_TIME]: 1000,
            [Settings.RANGE_WIDTH]: 150,
            [Settings.RANGE_HEIGHT]: 50,
            [Settings.TAB_VIEW_SCROLL_DISTANCE]: 10,
            [Settings.MENU_AREA_SCROLL_DISTANCE]: 200,
            [Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS]: 300,
            [Settings.ACTIVATE_NAV_AREAS]: true,
            [Settings.DEFAULT_URL]: "https://www.google.com",
            [Settings.DEFAULT_LAYOUT]: "en"
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
    return getSetting(Settings.DEFAULT_URL);
}

function getRangeWidth() {
    return getSetting(Settings.RANGE_WIDTH).then(value => parseInt(value, 10));
}

function getRangeHeight() {
    return getSetting(Settings.RANGE_HEIGHT).then(value => parseInt(value, 10));
}

function getActivateNavAreas() {
    return getSetting(Settings.ACTIVATE_NAV_AREAS).then(value => value === 'true');
}

function getTabScrollDistance() {
    return getSetting(Settings.TAB_VIEW_SCROLL_DISTANCE).then(value => parseInt(value, 10));
}

function getMenuScrollDistance() {
    return getSetting(Settings.MENU_AREA_SCROLL_DISTANCE).then(value => parseInt(value, 10));
}

function getDwellTime() {
    return getSetting(Settings.DWELL_TIME).then(value => parseInt(value, 10));
}

function getKeyboardDwellTime() {
    return getSetting(Settings.KEYBOARD_DWELL_TIME).then(value => parseInt(value, 10));
}

function getMenuScrollInterval() {
    return getSetting(Settings.MENU_AREA_SCROLL_INTERVAL_IN_MS).then(value => parseInt(value, 10));
}

function getDefaultLayout() {
    return getSetting(Settings.DEFAULT_LAYOUT);
}

// =================================
// =========== SETTERS =============
// =================================

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
    getRangeWidth,
    getRangeHeight,
    getActivateNavAreas,
    getTabScrollDistance,
    getMenuScrollDistance,
    getMenuScrollInterval,
    getDwellTime,
    getKeyboardDwellTime,

    deleteBookmarkByUrl,
    deleteAllTabs
};