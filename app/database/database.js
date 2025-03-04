const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

// =================================
// =========== REMOVING ============
// =================================

function removeBookmarkByUrl(url) {
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

// =================================
// ========== RETRIEVING ===========
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
    });
}

module.exports = {
    connect,
    close,
    createTables,
    addBookmark,
    getBookmarks,
    removeBookmarkByUrl,
};