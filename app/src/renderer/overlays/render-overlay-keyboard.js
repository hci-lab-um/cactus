const { ipcRenderer } = require('electron');
const config = require('config');
const fs = require('fs');
const path = require('path');
const { dwell, dwellInfinite } = require('../../tools/utils');
const { createCursor, followCursor, getMouse } = require('../../tools/cursor')
const DOMPurify = require('dompurify');

// Exposes an HTML sanitizer to allow for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
window.addEventListener('DOMContentLoaded', () => {
    // Expose DOMPurify to the renderer process
    window.sanitizeHTML = (html) => {
        return DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
    };

    //Init cursor
    createCursor('cactus_cursor');
    followCursor('cactus_cursor');
});

ipcRenderer.on('ipc-main-keyboard-loaded', async (event, elementToUpdate) => {
    // const NUMPAD_REQUIRED_ELEMENTS = [ 'number', 'tel', 'date', 'datetime-local', 'month', 'time', 'week' ]; // revise these
    const NUMPAD_REQUIRED_ELEMENTS = ['number', 'tel'];
    let needsNumpad = NUMPAD_REQUIRED_ELEMENTS.indexOf(elementToUpdate.type) !== -1;
    let fileName = needsNumpad ? "numeric" : config.get('keyboard.defaultLayout');
    let pathToLayouts = path.join(__dirname, '../../pages/json/keyboard/');

    Keyboard.init(pathToLayouts, fileName, elementToUpdate);
});

ipcRenderer.on('ipc-trigger-click-under-cursor', (event) => {
    const mouse = getMouse();
    const element = document.elementFromPoint(mouse.x, mouse.y);
    if (element) {
        element.click();
    }
});

const Keyboard = {
    elements: {
        main: null,
        keysContainer: null,
        keys: [],
        textarea: null,
    },

    properties: {
        capsLock: false,
        specialKeys: false,
        numpad_leftColumn: ["+", "-", ".", "space"],
        numpad_rightColumn: ["mic", "backspace", "AC", "send"],
    },

    async init(pathToLayouts, fileName, elementToUpdate) {
        this.pathToLayouts = pathToLayouts;
        this.keyboardLayout = await this._getKeyboardLayout(fileName);
        this.elementToUpdate = elementToUpdate;

        // Setting up main elements
        this.elements.main = document.getElementById("keyboard-container");

        this._createTextboxArea(elementToUpdate.value);

        if (this.keyboardLayout.layout === "numeric") {
            this._createNumpadArea();
        } else {
            this.elements.keysContainer = document.createElement("div");
            this.elements.keysContainer.classList.add("keyboard__keys", "fadeInUp");
            this.elements.main.appendChild(this.elements.keysContainer);

            // Creating initial main area keys
            await this._updateKeys();
        }
    },

    _getKeyboardLayout(fileName) {
        let layoutPath = path.join(this.pathToLayouts, fileName + ".json");
        return new Promise((resolve, reject) => {
            fs.readFile(layoutPath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error loading keyboard layout:', err);
                    reject(err);
                    return;
                }
                resolve(JSON.parse(data));
            });
        });
    },

    _createTextboxArea(previousValue) {
        const textboxArea = document.createElement("div");
        textboxArea.classList.add("keyboard__textbox-area", "fadeInDown");

        const textarea = document.createElement("textarea");
        textarea.classList.add("keyboard__textbox");
        textarea.value = previousValue;
        textboxArea.appendChild(textarea);

        const arrowKeys = this._createArrowKeys();
        textboxArea.appendChild(arrowKeys);

        const closeButton = this._createKeyElement("close");
        textboxArea.appendChild(closeButton);

        this.elements.main.appendChild(textboxArea);
        this.elements.textarea = textarea;
        this.elements.textarea.focus();
        // Ensuring textarea stays focused by refocusing it if focus is lost
        this.elements.textarea.addEventListener("focusout", (event) => {
            setTimeout(() => this.elements.textarea.focus(), 0);
        });
    },

    _createArrowKeys() {
        // If a numeric keyboard layout is used, the up and down arrow keys are not displayed
        let arrowKeysLayout = this.keyboardLayout.layout === "numeric" ?
            {
                row1: ["arrow-home", "arrow-end"],
                row2: ["arrow-left", "arrow-right"]
            } :
            {
                row1: ["arrow-home", "arrow-up", "arrow-end"],
                row2: ["arrow-left", "arrow-down", "arrow-right"]
            };

        const arrowKeysContainer = document.createElement("div");
        arrowKeysContainer.classList.add("keyboard__arrow-keys");

        // Creating first row of arrow keys
        const arrowKeysRow1 = document.createElement("div");
        arrowKeysRow1.classList.add("keyboard__arrow-keys--row");

        arrowKeysLayout.row1.forEach(key => {
            const keyElement = this._createKeyElement(key);
            arrowKeysRow1.appendChild(keyElement);
        });
        arrowKeysContainer.appendChild(arrowKeysRow1);

        // Creating second row of arrow keys
        const arrowKeysRow2 = document.createElement("div");
        arrowKeysRow2.classList.add("keyboard__arrow-keys--row");

        arrowKeysLayout.row2.forEach(key => {
            const keyElement = this._createKeyElement(key);
            arrowKeysRow2.appendChild(keyElement);
        });
        arrowKeysContainer.appendChild(arrowKeysRow2);

        return arrowKeysContainer;
    },

    _createNumpadArea() {
        const addKeyElement = (key, container, ...classes) => {
            const keyElement = this._createKeyElement(key);
            keyElement.classList.add(...classes);
            container.appendChild(keyElement);
        };

        for (let i = 0; i < this.keyboardLayout.keys.length; i++) {
            const row = this.keyboardLayout.keys[i];
            const rowContainer = document.createElement("div");
            rowContainer.classList.add("keyboard__row");

            // Adding key before each row
            addKeyElement(this.properties.numpad_leftColumn[i], rowContainer, "keyboard__key--equal-width", "keyboard__key--darker");

            row.forEach(key => {
                addKeyElement(key, rowContainer, "keyboard__key--equal-width");
            });

            // Adding key after each row
            addKeyElement(this.properties.numpad_rightColumn[i], rowContainer, "keyboard__key--equal-width");

            this.elements.main.appendChild(rowContainer);
        }
    },

    /**
     * Creates a keyboard layout based on the provided layout configuration that is not numerical.
     * This function does not create a numerical keyboard layout.
     * 
     * This method generates the DOM structure for a virtual keyboard, including
     * the top and bottom rows with additional necessary keys and middle rows that
     *  are based on the provided layout. The keys are created using the 
     * `_createKeyElement` method and are appended to a document fragment.
     * 
     * @param {Array<Array<string>>} layout - A 2D array representing the keyboard layout.
     * @returns {Promise<DocumentFragment>} A promise that resolves to a document fragment containing the keyboard layout.
     * @private
     */
    async _createKeys(layout) {
        const fragment = document.createDocumentFragment();

        // TOP ROW
        const topRow = ["mic", "facebook.com", "booking.com", "google.com", "delete letter", "delete word", "AC"]; // text would eventually be replaced with auto-complete suggestions
        const topRowContainer = document.createElement("div");
        topRowContainer.classList.add("keyboard__row");

        topRow.forEach(key => {
            const keyElement = this._createKeyElement(key);
            topRowContainer.appendChild(keyElement);
        });
        fragment.appendChild(topRowContainer);

        // MIDDLE ROWS
        let layoutCopy = layout.map(row => row.slice()); // creating deep copy of the layout to prevent repeatedly adding "caps" and "enter" to the original layout
        if (this.properties.specialKeys && this.properties.capsLock) {
            layoutCopy = layoutCopy.slice(0, -1);
        }

        // Adding "caps" to the beginning and "enter" to the end of the last row
        layoutCopy[layoutCopy.length - 1].unshift("caps");
        layoutCopy[layoutCopy.length - 1].push("enter");

        layoutCopy.forEach(row => {
            const rowContainer = document.createElement("div");
            rowContainer.classList.add("keyboard__row");

            row.forEach(key => {
                const keyElement = this._createKeyElement(key);
                if (key != "caps" && key != "enter") keyElement.classList.add("keyboard__key--equal-width"); // this ensures that all keys are of equal width except for "caps" and "enter"
                rowContainer.appendChild(keyElement);
            });

            fragment.appendChild(rowContainer);
        });

        // BOTTOM ROW
        let bottomRow = [];

        /*
         * If the special keys are displayed (the "?123" button is clicked), and the capslock button is active, 
         * the keyboard's bottom row changes. Instead of the default comma, fullstop, and ".com" keys, the keys from the last 
         * row in the special keys layout are displayed. Note that when the special keys are displayed the 
         * capslock icon changes to "=\<" to signify that more special keys are available.
         */
        if (this.properties.specialKeys && this.properties.capsLock) {
            let keys = layout[layout.length - 1];
            bottomRow = ["settings", "?123", keys[0], "space", keys[1], "send"];
        } else {
            bottomRow = ["settings", "?123", ",", "space", ".", ".com", "send"];
        }

        const bottomRowContainer = document.createElement("div");
        bottomRowContainer.classList.add("keyboard__row");

        bottomRow.forEach(key => {
            const keyElement = this._createKeyElement(key);
            bottomRowContainer.appendChild(keyElement);
        });
        fragment.appendChild(bottomRowContainer);

        return fragment;
    },

    _createKeyElement(key) {
        const keyElement = document.createElement("button");

        // Add attributes/classes
        keyElement.setAttribute("type", "button");
        keyElement.classList.add("keyboard__key");

        switch (key) {
            case "arrow-home":
                keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-once");
                keyElement.innerHTML = this._createMaterialIcon("first_page");

                dwell(keyElement, () => {
                    this._moveCursorToLineStart();
                }, true);

                break;

            case "arrow-end":
                keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-once");
                keyElement.innerHTML = this._createMaterialIcon("last_page");

                dwell(keyElement, () => {
                    this._moveCursorToLineEnd();
                }, true);

                break;

            case "arrow-up":
                keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_up");

                dwellInfinite(keyElement, () => {
                    this._moveCursorUpDown(-1);
                });

                break;

            case "arrow-down":
                keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_down");

                dwellInfinite(keyElement, () => {
                    this._moveCursorUpDown(1);
                });

                break;

            case "arrow-left":
                keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_left");

                dwellInfinite(keyElement, () => {
                    this._moveCursorLeftRight(-1);
                });

                break;

            case "arrow-right":
                keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_right");

                dwellInfinite(keyElement, () => {
                    this._moveCursorLeftRight(1);
                });

                break;

            case "close":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--close", "keyboard__key--dwell-once");
                keyElement.innerHTML = this._createMaterialIcon("close");

                // This key must only be dwellable once!
                dwell(keyElement, () => {
                    ipcRenderer.send('ipc-overlays-remove');
                }, true);

                break;

            case "mic":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-once");
                keyElement.innerHTML = this._createMaterialIcon("mic");

                dwell(keyElement, () => {
                    // listen for voice input
                }, true);

                break;

            case "text1":
            case "text2":
            case "text3":
                keyElement.classList.add("keyboard__key--wider", "keyboard__key--dark", "keyboard__key--dwell-once");
                keyElement.innerHTML = key;

                dwell(keyElement, () => {
                    this._insertChar(key);
                }, true);

                break;

            case "backspace":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                keyElement.innerHTML = this._createMaterialIcon("backspace");

                dwellInfinite(keyElement, () => {
                    this._deleteChar();
                });

                break;

            case "delete letter":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                keyElement.innerHTML = this._createCustomIcon("delete_letter");

                dwellInfinite(keyElement, () => {
                    this._deleteChar();
                });

                break;

            case "delete word":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                keyElement.innerHTML = this._createCustomIcon("delete_word");

                dwellInfinite(keyElement, () => {
                    this._deleteWord();
                });

                break;

            case "AC":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-once");
                keyElement.innerHTML = "AC";

                dwell(keyElement, () => {
                    this.elements.textarea.value = "";
                }, true);

                break;

            case "caps":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--activatable", "keyboard__key--dwell-infinite");
                if (this.keyboardLayout.layout !== "numeric") keyElement.classList.add("keyboard__key--wide");
                keyElement.classList.toggle("keyboard__key--active", this.properties.capsLock);

                // This allows the virtual keyboard to dynamically switch between different icons based on the current state of the keyboard.
                // If the special keys are displayed (the "?123" button is clicked), the capslock icon changes to "=\<" to signify that more special keys are available.
                if (this.properties.specialKeys) {
                    keyElement.textContent = "=\\<";
                } else {
                    keyElement.innerHTML = this._createMaterialIcon("keyboard_capslock");
                }

                dwellInfinite(keyElement, () => {
                    this._toggleCapsLock();
                });

                break;

            case "enter":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                if (this.keyboardLayout.layout !== "numeric") keyElement.classList.add("keyboard__key--wide");
                keyElement.innerHTML = this._createMaterialIcon("keyboard_return");

                dwellInfinite(keyElement, () => {
                    this._insertChar("\n");
                });

                break;

            case "settings":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-once");
                keyElement.innerHTML = this._createMaterialIcon("settings");

                dwell(keyElement, () => {
                    this._openSettingsOverlay();
                }, true);

                break;

            case "?123":
                keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                keyElement.textContent = this.properties.specialKeys ? "ABC" : "?123";

                dwellInfinite(keyElement, () => {
                    this._toggleSpecialKeys();
                });

                break;

            case "space":
                keyElement.classList.add("keyboard__key--dwell-infinite");
                if (this.keyboardLayout.layout !== "numeric") keyElement.classList.add("keyboard__key--widest");
                keyElement.innerHTML = this._createMaterialIcon("space_bar");

                dwellInfinite(keyElement, () => {
                    this._insertChar(" ");
                });

                break;

            case "send":
                keyElement.classList.add("keyboard__key--wider", "keyboard__key--yellow-border", "keyboard__key--darker", "keyboard__key--dwell-once");
                keyElement.innerHTML = this._createMaterialIcon("send");

                dwell(keyElement, () => {
                    if (this.elementToUpdate) {
                        // sending the keyboard value to render-mainwindow.js
                        console.log("send button pressed");
                        console.log("elementToUpdate", this.elementToUpdate);
                        ipcRenderer.send('ipc-keyboard-input', this.elements.textarea.value, this.elementToUpdate);
                    }
                }, true);

                break;

            default:
                keyElement.classList.add("keyboard__key--dwell-infinite");
                keyElement.textContent = key;

                dwellInfinite(keyElement, () => {
                    this._insertChar(key);
                });

                break;
        }

        return keyElement;
    },

    _createMaterialIcon(icon_name) {
        return `<i class="material-icons--outlined-filled">${icon_name}</i>`;
    },

    _createCustomIcon(icon_name) {
        return `<i class="custom-icons">${icon_name}</i>`;
    },

    _toggleCapsLock() {
        this.properties.capsLock = !this.properties.capsLock;
        this._updateKeys();
    },

    _toggleSpecialKeys() {
        this.properties.specialKeys = !this.properties.specialKeys;

        // this ensures that the caps lock icon does not remian activated when switching to special keys
        this.properties.capsLock = this.properties.capsLock ? false : this.properties.capsLock;

        this._updateKeys();
    },

    // Inserts the selected key into the textarea at the current cursor position and updates the cursor position
    _insertChar(key) {
        const textarea = this.elements.textarea;
        const currentPos = textarea.selectionStart;
        const value = textarea.value;

        // Insert the letter(s) at the current cursor position
        const newValue = value.slice(0, currentPos) + key + value.slice(currentPos);

        // Update the textarea value and set the new cursor position
        textarea.value = newValue;
        const newCursorPos = currentPos + key.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        console.log("newPosition", newCursorPos);
        textarea.focus();
    },

    // Deletes the character from the textarea at the current cursor position and updates the cursor position
    _deleteChar() {
        const textarea = this.elements.textarea;
        const currentPos = textarea.selectionStart;
        const value = textarea.value;

        // If the cursor is at the beginning, do nothing
        if (currentPos === 0) {
            return;
        }

        // Delete the character before the current cursor position
        const newValue = value.slice(0, currentPos - 1) + value.slice(currentPos);

        // Update the textarea value and set the new cursor position
        textarea.value = newValue;
        textarea.setSelectionRange(currentPos - 1, currentPos - 1);
        console.log("newPosition", currentPos - 1);
        textarea.focus();
    },

    /**
     * This method deletes the word that the cursor is currently touching, excluding whitespace. 
     * 
     * If the cursor is at the end of a word, the entire word will be deleted.
     * E.g. "Hello, World!*cursor here*" -> "Hello, *cursor here*" (whitespace after comma is not deleted)
     * 
     * If the cursor is in the middle of the word, the entire word, including letters that come after the cursor, will be deleted.
     * E.g. "Hello, Wor*cursor here*ld!" -> "Hello, *cursor here*" (whitespace after comma is not deleted)
     * 
     * If the cursor is at the beginning of the word, the word will also be deleted.
     * E.g. "Hello, *cursor here*World!" -> "Hello, *cursor here*" (whitespace after comma is not deleted)
     */
    _deleteWord() {
        const textarea = this.elements.textarea;
        const currentPos = textarea.selectionStart;
        const value = textarea.value;

        // If the cursor is at the beginning, do nothing
        if (currentPos === 0) {
            console.log("Cursor is at the beginning");
            return;
        }

        // Find the position of the last word before and including the cursor
        const beforeCursor = value.slice(0, currentPos);
        const afterCursor = value.slice(currentPos);
        const newValue = beforeCursor.replace(/\S*$/, '') + afterCursor.replace(/^\S*/, '');

        // Update the textarea value and set the new cursor position
        const deletedLength = beforeCursor.length - beforeCursor.replace(/\S*$/, '').length;
        const newCursorPos = currentPos - deletedLength;
        textarea.value = newValue;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        console.log("newPosition", newCursorPos);
        textarea.focus();
    },

    _moveCursorLeftRight(offset) {
        const textarea = this.elements.textarea;
        const start = textarea.selectionStart;
        console.log("start", start);

        // Calculate new cursor position
        const newPosition = Math.max(0, start + offset);

        // Set new cursor position
        textarea.setSelectionRange(newPosition, newPosition);
        console.log("newPosition", newPosition);
        textarea.focus();
    },

    _moveCursorUpDown(offset) {
        const textarea = this.elements.textarea;
        const currentPos = textarea.selectionStart;

        // Get the current line number and column number
        const lines = textarea.value.substr(0, currentPos).split("\n");
        const currentLineNumber = lines.length - 1;
        const currentColumnNumber = lines[lines.length - 1].length;

        // Calculate new line number
        const newLineNumber = currentLineNumber + offset;

        // Ensure new line number is within bounds
        if (newLineNumber < 0 || newLineNumber >= textarea.value.split("\n").length) {
            return;
        }

        // Calculate new cursor position
        const newLines = textarea.value.split("\n");
        const newLineLength = newLines[newLineNumber].length;
        const newPosition = newLines.slice(0, newLineNumber).join("\n").length + Math.min(currentColumnNumber, newLineLength) + 1;

        // Set new cursor position
        textarea.setSelectionRange(newPosition, newPosition);
        console.log("newPosition", newPosition);
        textarea.focus();
    },

    _moveCursorToLineStart() {
        const textarea = this.elements.textarea;
        const currentPos = textarea.selectionStart;
        const value = textarea.value;

        // Find the start of the current line
        const lineStart = value.lastIndexOf('\n', currentPos - 1) + 1;

        // Set the cursor position to the start of the line
        textarea.setSelectionRange(lineStart, lineStart);
        textarea.focus();
    },

    _moveCursorToLineEnd() {
        const textarea = this.elements.textarea;
        const currentPos = textarea.selectionStart;
        const value = textarea.value;

        // Find the end of the current line
        const lineEnd = value.indexOf('\n', currentPos);
        const newCursorPos = lineEnd === -1 ? value.length : lineEnd;

        // Set the cursor position to the end of the line
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
    },

    _openSettingsOverlay() {
        // Create and display the overlay
        const overlay = document.createElement("div");
        overlay.classList.add("keyboard__overlay");

        // Create and display the settings popup
        const popup = document.createElement("div");
        popup.classList.add("settings-popup");

        const languages = ["en", "mt", "it", "fr"];
        languages.forEach(language => {
            const button = document.createElement("button");
            button.textContent = language.toUpperCase();
            dwellInfinite(button, async () => {
                try {
                    this.keyboardLayout = await this._getKeyboardLayout(language);
                    await this._updateKeys();
                } catch (error) {
                    console.error('Failed to load keyboard layout:', error);
                }
                document.body.removeChild(popup);
                document.body.removeChild(overlay);
            });
            popup.appendChild(button);
        });

        document.body.appendChild(overlay);
        document.body.appendChild(popup);
    },

    async _updateKeys() {
        let layout;
        if (this.properties.specialKeys) {
            layout = this.properties.capsLock ? this.keyboardLayout.special_keys.shift : this.keyboardLayout.special_keys.default;
        } else {
            layout = this.properties.capsLock ? this.keyboardLayout.main_keys.shift : this.keyboardLayout.main_keys.default;
        }

        // Clear existing keys
        this.elements.keysContainer.innerHTML = "";

        // Create new keys
        const keysFragment = await this._createKeys(layout);
        this.elements.keysContainer.appendChild(keysFragment);

        // Update keys reference
        this.elements.keys = this.elements.keysContainer.querySelectorAll(".keyboard__key");
    }
};