const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'cactus.db');
const crypto = require('crypto');

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

function createTables() {
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
        const createShortcutsTable = `
            CREATE TABLE IF NOT EXISTS shortcuts (
                action TEXT PRIMARY KEY,
                shortcut TEXT NOT NULL
            );
        `;
        db.run(createBookmarksTable, (err) => {
            if (err) {
                console.error('Error creating bookmarks table:', err.message);
                reject(err);
            } else {
                console.log('Bookmarks table created successfully.');
                db.run(createTabsTable, (err) => {
                    if (err) {
                        console.error('Error creating tabs table:', err.message);
                        reject(err);
                    } else {
                        console.log('Tabs table created successfully.');
                        db.run(createShortcutsTable, (err) => {
                            if (err) {
                                console.error('Error creating shortcuts table:', err.message);
                                reject(err);
                            } else {
                                console.log('Shortcuts table created successfully.');
                                const shortcuts = {
                                    "click": "CommandOrControl+Alt+C",
                                    "toggleOmniBox": "CommandOrControl+Alt+O",
                                    "toggleDwelling": "CommandOrControl+Alt+D",
                                    "zoomIn": "CommandOrControl+Alt+Plus",
                                    "zoomOut": "CommandOrControl+Alt+-",
                                    "sidebarScrollUp": "CommandOrControl+Alt+W",
                                    "sidebarScrollDown": "CommandOrControl+Alt+S",
                                    "navigateForward": "CommandOrControl+Alt+Right",
                                    "navigateBack": "CommandOrControl+Alt+Left"
                                };
                                const insertShortcut = `
                                    INSERT INTO shortcuts (action, shortcut)
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
                            }
                        });
                    }
                });
            }
        });
    });
}

// =================================
// ============ ADDING =============
// =================================

function addBookmark({url, title, snapshot}) {
    // Converting base64 image to buffer
    const base64Data = snapshot.replace(/^data:image\/\w+;base64,/, "");
    const binarySnapshot = Buffer.from(base64Data, "base64");

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
}

function addTab({url, title, isActive, snapshot, originalURL, isErrorPage}) {
    // Converting base64 image to buffer if snapshot is provided
    const base64Data = snapshot.replace(/^data:image\/\w+;base64,/, "");
    const binarySnapshot = Buffer.from(base64Data, "base64");

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
    deleteBookmarkByUrl,
    deleteAllTabs
};