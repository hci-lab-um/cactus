const { ipcRenderer } = require('electron');
const config = require('config');
const fs = require('fs');
const path = require('path');
const { dwell } = require('../../tools/utils');
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

        // // Automatically use keyboard for elements with .use-keyboard-input
        // document.querySelectorAll(".use-keyboard-input").forEach(element => {
        //     element.addEventListener("focus", () => {
        //         // this.open(element.value, currentValue => {
        //         //     element.value = currentValue;
        //         // });
        //         this.open;
        //     });
        // });

        // Addding event listeners for arrow keys
        document.querySelector("#arrow-left").parentElement.addEventListener("click", () => {
            this._moveCursor(-1);
        });
        document.querySelector("#arrow-right").parentElement.addEventListener("click", () => {
            this._moveCursor(1);
        });
        document.querySelector("#arrow-up").parentElement.addEventListener("click", () => {
            this._moveCursorUpDown(-1);
        });
        document.querySelector("#arrow-down").parentElement.addEventListener("click", () => {
            this._moveCursorUpDown(1);
        });
    },

    async _createKeys(layout) {
        const fragment = document.createDocumentFragment();

        // TOP ROW
        const topRow = ["mic", "text1", "text2", "text3", "text4", "backspace", "AC"];
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
                rowContainer.appendChild(keyElement);
            });

            fragment.appendChild(rowContainer);
        });

        // BOTTOM ROW
        let bottomRow = [];
        if (this.properties.specialKeys && this.properties.capsLock) {
            let keys = layout[layout.length - 1];
            bottomRow = ["settings", "?123", keys[0], "space", keys[1], "done"];
        } else {
            bottomRow = ["settings", "?123", ",", "space", ".", "done"];
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
                keyElement.innerHTML = this._createIconHTML("mic");

                keyElement.addEventListener("click", () => {
                    // listen for voice input
                });

                break;

            case "text1":
            case "text2":
            case "text3":
            case "text4":
                keyElement.classList.add("keyboard__key--wider", "keyboard__key--dark");
                keyElement.innerHTML = key;

                keyElement.addEventListener("click", () => {
                    this.elements.textarea.value += key;
                });

                break;

            case "backspace":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.innerHTML = this._createIconHTML("backspace");

                keyElement.addEventListener("click", () => {
                    // this.properties.value = this.properties.value.substring(0, this.properties.value.length - 1);
                    // this._triggerEvent("oninput");
                    this.elements.textarea.value = this.elements.textarea.value.slice(0, -1);
                });

                break;

            case "AC":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.innerHTML = "AC";

                keyElement.addEventListener("click", () => {
                    this.elements.textarea.value = "";
                });

                break;

            case "caps":
                keyElement.classList.add("keyboard__key--wide", "keyboard__key--darker", "keyboard__key--activatable");
                keyElement.innerHTML = this._createIconHTML("keyboard_capslock");
                keyElement.classList.toggle("keyboard__key--active", this.properties.capsLock);

                keyElement.addEventListener("click", () => {
                    this._toggleCapsLock();
                });

                break;

            case "enter":
                keyElement.classList.add("keyboard__key--wide", "keyboard__key--darker");
                keyElement.innerHTML = this._createIconHTML("keyboard_return");

                keyElement.addEventListener("click", () => {
                    this.elements.textarea.value += "\n";
                });

                break;

            case "settings":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.innerHTML = this._createIconHTML("settings");

                keyElement.addEventListener("click", () => {
                    this._openSettingsPopup();
                });

                break;

            case "?123":
                keyElement.classList.add("keyboard__key--darker");
                keyElement.textContent = this.properties.specialKeys ? "ABC" : "?123";

                keyElement.addEventListener("click", () => {
                    this._toggleSpecialKeys();
                });

                break;

            case "space":
                keyElement.classList.add("keyboard__key--widest");
                keyElement.innerHTML = this._createIconHTML("space_bar");

                keyElement.addEventListener("click", () => {
                    this.elements.textarea.value += " ";
                });

                break;

            case "done":
                keyElement.classList.add("keyboard__key--wider", "keyboard__key--yellow-border", "keyboard__key--darker");
                keyElement.innerHTML = this._createIconHTML("check_circle");

                keyElement.addEventListener("click", () => {
                    this.close();
                    this._triggerEvent("onclose");
                });

                break;

            default:
                keyElement.textContent = key;

                keyElement.addEventListener("click", () => {
                    this.elements.textarea.value += key;
                    this._triggerEvent("oninput");
                });

                break;
        }

        return keyElement;
    },

    _toggleCapsLock() {
        this.properties.capsLock = !this.properties.capsLock;
        this._updateKeys();
    },

    _toggleSpecialKeys() {
        this.properties.specialKeys = !this.properties.specialKeys;
        this._updateKeys();
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

    _openSettingsPopup() {
        // Create and display the settings popup
        const popup = document.createElement("div");
        popup.classList.add("settings-popup");

        const languages = ["en", "mt", "it", "fr"];
        languages.forEach(language => {
            const button = document.createElement("button");
            button.textContent = language;
            button.addEventListener("click", async () => {
                try {
                    await this._getKeyboardLayout(language);
                    await this._updateKeys();
                } catch (error) {
                    console.error('Failed to load keyboard layout:', error);
                }
                document.body.removeChild(popup);
            });
            popup.appendChild(button);
        });

        document.body.appendChild(popup);
    },

    _createIconHTML(icon_name) {
        return `<i class="material-icons">${icon_name}</i>`;
    },

    _moveCursor(offset) {
        const textarea = this.elements.textarea;
        const start = textarea.selectionStart;

        // Calculate new cursor position
        const newPosition = Math.max(0, start + offset);

        // Set new cursor position
        textarea.setSelectionRange(newPosition, newPosition);
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
        textarea.focus();
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