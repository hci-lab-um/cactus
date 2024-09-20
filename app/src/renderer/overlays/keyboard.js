const { ipcRenderer } = require('electron');
const config = require('config');
const fs = require('fs');
const path = require('path');
const { keyboardDwell } = require('../../tools/utils');
const { createCursor, followCursor } = require('../../tools/cursor')
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

const Keyboard = {
    elements: {
        main: null,
        keysContainer: null,
        keys: [],
        textarea: null
    },

    eventHandlers: {
        oninput: null,
        onclose: null
    },

    properties: {
        capsLock: false,
        specialKeys: false
    },

    async init() {
    // Setting up main elements
        this.elements.main = document.getElementById("keyboard-container");
        this.elements.main.classList.add("keyboard");

        this.elements.keysContainer = document.createElement("div");
        this.elements.keysContainer.classList.add("keyboard__keys");

        this.elements.main.appendChild(this.elements.keysContainer);
        this.elements.textarea = document.querySelector(".keyboard__textbox");
        this.elements.textarea.focus();

        // Ensuring textarea stays focused by refocusing it if focus is lost
        this.elements.textarea.addEventListener("focusout", (event) => {
            setTimeout(() => this.elements.textarea.focus(), 0);
        });

        // Load keyboard layout
        try {
            let defaultLayout = config.get('keyboard.defaultLayout');
            this.keyboardLayout = await this._getKeyboardLayout(defaultLayout);
        } catch (error) {
            console.error('Failed to load keyboard layout:', error);
        }

        // Creating initial keys
        await this._updateKeys();

        // Adding event listeners for arrow keys
        keyboardDwell(document.querySelector("#arrow-left"), () => {
            this._moveCursorLeftRight(-1);
        });
        keyboardDwell(document.querySelector("#arrow-right"), () => {
            this._moveCursorLeftRight(1);
        });
        keyboardDwell(document.querySelector("#arrow-up"), () => {
            this._moveCursorUpDown(-1);
        });
        keyboardDwell(document.querySelector("#arrow-down"), () => {
            this._moveCursorUpDown(1);
        });
        keyboardDwell(document.querySelector("#arrow-home"), () => {
            this._moveCursorToLineStart();
        });
        keyboardDwell(document.querySelector("#arrow-end"), () => {
            this._moveCursorToLineEnd();
        });

        // Event listener for closing the keyboard
        keyboardDwell(document.querySelector("#close"), () => {
            ipcRenderer.send('ipc-keyboard-remove');
        });
    },

    async _createKeys(layout) {
        const fragment = document.createDocumentFragment();

        // TOP ROW
        const topRow = ["mic", "text1", "text2", "text3", "backspace", "delete word", "AC"]; // text would evetually be replaced with auto-suggestions
        const topRowContainer = document.createElement("div");
        topRowContainer.classList.add("keyboard__row");

        topRow.forEach(key => {
            const keyElement = this._createKeyElement(key);
            topRowContainer.appendChild(keyElement);
        });
        fragment.appendChild(topRowContainer);

        // MIDDLE ROWS
        let layoutCopy = layout.map(row => row.slice()); // creating deep copy of the layout
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
        if (this.properties.specialKeys && this.properties.capsLock) {
            let keys = layout[layout.length - 1];
            bottomRow = ["settings", "?123", keys[0], "space", keys[1], "send"];
        } else {
            bottomRow = ["settings", "?123", ",", "space", ".", "send"];
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
            case "mic":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.innerHTML = this._createMaterialIcon("mic");

                keyboardDwell(keyElement, () => {
                    // listen for voice input
                });

                break;

            case "text1":
            case "text2":
            case "text3":
                keyElement.classList.add("keyboard__key--wider", "keyboard__key--dark");
                keyElement.innerHTML = key;

                keyboardDwell(keyElement, () => {
                    this._insertChar(key);
                });

                break;

            case "backspace":
                keyElement.classList.add("keyboard__key--darker", "custom-icons--delete-letter");
                keyElement.innerHTML = this._createCustomIcon("delete_letter");

                keyboardDwell(keyElement, () => {
                    this._deleteChar();
                });

                break;

            case "delete word":
                keyElement.classList.add("keyboard__key--darker", "custom-icons--delete-word");
                keyElement.innerHTML = this._createCustomIcon("delete_word");

                keyboardDwell(keyElement, () => {
                    this._deleteWord();
                });

                break;

            case "AC":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.innerHTML = "AC";

                keyboardDwell(keyElement, () => {
                    this.elements.textarea.value = "";
                });

                break;

            case "caps":
                keyElement.classList.add("keyboard__key--wide", "keyboard__key--darker", "keyboard__key--activatable");
                keyElement.classList.toggle("keyboard__key--active", this.properties.capsLock);

                if (this.properties.specialKeys) {
                    keyElement.textContent = "=\\<";
                } else {
                    keyElement.innerHTML = this._createMaterialIcon("keyboard_capslock");
                }

                keyboardDwell(keyElement, () => {
                    this._toggleCapsLock();
                });

                break;

            case "enter":
                keyElement.classList.add("keyboard__key--wide", "keyboard__key--darker");
                keyElement.innerHTML = this._createMaterialIcon("keyboard_return");

                keyboardDwell(keyElement, () => {
                    this._insertChar("\n");
                });

                break;

            case "settings":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.innerHTML = this._createMaterialIcon("settings");

                keyboardDwell(keyElement, () => {
                    this._openSettingsPopup();
                });

                break;

            case "?123":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.textContent = this.properties.specialKeys ? "ABC" : "?123";

                keyboardDwell(keyElement, () => {
                    this._toggleSpecialKeys();
                });

                break;

            case "space":
                keyElement.classList.add("keyboard__key--widest");
                keyElement.innerHTML = this._createMaterialIcon("space_bar");

                keyboardDwell(keyElement, () => {
                    this._insertChar(" ");
                });

                break;

            case "send":
                keyElement.classList.add("keyboard__key--wider", "keyboard__key--yellow-border", "keyboard__key--darker");
                keyElement.innerHTML = this._createMaterialIcon("send");

                keyboardDwell(keyElement, () => {
                // send text to main process
                });

                break;

            default:
                keyElement.textContent = key;

                keyboardDwell(keyElement, () => {
                    this._insertChar(key);
                    // this._triggerEvent("oninput");
                });

                break;
        }

        return keyElement;
    },

    _createMaterialIcon(icon_name) {
        return `<i class="material-icons">${icon_name}</i>`;
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

    _openSettingsPopup() {
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
            keyboardDwell(button, async () => {
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
    },

    _triggerEvent(handlerName) {
        if (typeof this.eventHandlers[handlerName] == "function") {
            this.eventHandlers[handlerName](this.properties.value);
        }
    },

    open(initialValue, oninput, onclose) {
        this.properties.value = initialValue || "";
        this.eventHandlers.oninput = oninput;
        this.eventHandlers.onclose = onclose;
        this.elements.main.classList.remove("keyboard--hidden");
    },

    close() {
        this.properties.value = "";
        this.eventHandlers.oninput = oninput;
        this.eventHandlers.onclose = onclose;
        this.elements.main.classList.add("keyboard--hidden");
    },

    _getKeyboardLayout(defaultLayout = "en") {
        return new Promise((resolve, reject) => {
            const layoutPath = path.join(__dirname, '../../pages/json/keyboard/', `${defaultLayout}.json`);
            fs.readFile(layoutPath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error loading keyboard layout:', err);
                    reject(err);
                    return;
                }
                resolve(JSON.parse(data));
            });
        });
    }
};

ipcRenderer.on('ipc-main-keyboard-loaded', () => {
    Keyboard.init();
});