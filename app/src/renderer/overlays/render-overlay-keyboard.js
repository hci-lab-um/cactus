const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { dwell, dwellInfinite } = require('../../tools/utils');
const { createCursor, followCursor, getMouse } = require('../../tools/cursor')
const DOMPurify = require('dompurify');
const csv = require('csv-parser');
const { KeyboardLayouts } = require('../../tools/enums.js');
const logger = require('../../tools/logger.js');

// Exposes an HTML sanitizer to allow for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
window.addEventListener('DOMContentLoaded', () => {
    try {
        // Expose DOMPurify to the renderer process
        window.sanitizeHTML = (html) => {
            return DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
        };

        //Init cursor
        createCursor('cactus_cursor');
        followCursor('cactus_cursor');
    } catch (error) {
        logger.error('Error during keyboard DOMContentLoaded event:', error.message);
    }
});

ipcRenderer.on('ipc-main-keyboard-loaded', async (event, elementToUpdate, keyboardLayout, keyboardDwellTime) => {
    try {
        // Setting the keyboard dwell time in CSS variable  
        document.documentElement.style.setProperty('--keyboard-dwell-time', `${keyboardDwellTime}ms`);

        const NUMPAD_REQUIRED_ELEMENTS = ['number', 'tel', 'date', 'datetime-local', 'month', 'time', 'week']; // revise these
        let needsNumpad = NUMPAD_REQUIRED_ELEMENTS.indexOf(elementToUpdate.type) !== -1;

        let fileName = needsNumpad ? KeyboardLayouts.NUMERIC : keyboardLayout;
        let pathToLayouts = path.join(__dirname, '../../pages/json/keyboard/');
        let pathToWordFrequencyCSVs = path.join(__dirname, '../../../resources/frequency_lists/');

        await Keyboard.init(pathToLayouts, pathToWordFrequencyCSVs, fileName, elementToUpdate);
    } catch (error) {
        logger.error('Error in ipc-main-keyboard-loaded handler:', error.message);
    }
});

ipcRenderer.on('ipc-setting-update-keyboard-dwell-time', (event, newDwellTime) => {
    try {
        const root = document.documentElement;
        root.style.setProperty('--keyboard-dwell-time', `${newDwellTime}ms`);
    } catch (error) {
        logger.error('Error in ipc-setting-update-keyboard-dwell-time handler:', error.message);
    }
})

const Keyboard = {
    elements: {
        main: null,
        keysContainer: null,
        keys: [],
        textarea: null,
        togglePasswordButton: null,
    },

    properties: {
        capsLock: false,
        specialKeys: false,
        numpad_leftColumn: ["+", "-", ".", "space"],
        // numpad_rightColumn: ["mic", "backspace", "AC", "send"],
        numpad_rightColumn: ["backspace", "AC", "send", "submit"],
        isPasswordHidden: true,
        languages: [KeyboardLayouts.ENGLISH, KeyboardLayouts.MALTESE, KeyboardLayouts.ITALIAN, KeyboardLayouts.FRENCH]
    },

    async init(pathToLayouts, pathToWordFrequencyCSVs, fileName, elementToUpdate) {
        try {
            this.pathToLayouts = pathToLayouts;
            this.keyboardLayout = await this._getKeyboardLayout(fileName);

            // If the keyboard is not numeric, get the frequency map for automplete suggestions
            if (fileName !== KeyboardLayouts.NUMERIC) {
                this.pathToWordFrequencyCSVs = pathToWordFrequencyCSVs;
                this.frequencyMap = await this._getFrequencyMap(fileName);
            }

            this.elementToUpdate = elementToUpdate;
            console.log("elementToUpdate", elementToUpdate);

            // Setting up main elements
            this.elements.main = document.getElementById("keyboard-container");

            this._createTextboxArea(elementToUpdate.value);

            if (this.keyboardLayout.layout === KeyboardLayouts.NUMERIC) {
                this._createNumpadArea();
            } else {
                this.elements.keysContainer = document.createElement("div");
                this.elements.keysContainer.classList.add("keyboard__keys", "fadeInUp");
                this.elements.main.appendChild(this.elements.keysContainer);

                // Creating initial main area keys
                await this._updateKeys();
            }

            if (this.elementToUpdate.type === "password") {
                this.suggestions = ['', '', '']
                this._updateAutocompleteSuggestions();
            } else if (fileName !== KeyboardLayouts.NUMERIC) {
                // Set suggestions
                this.suggestions = this._getAutocompleteSuggestions(this.elements.textarea.value);
                this._updateAutocompleteSuggestions();
            }
        } catch (error) {
            logger.error('Error initializing keyboard:', error.message);
        }
    },

    async _getKeyboardLayout(fileName) {
        try {
            let layoutPath = path.join(this.pathToLayouts, fileName + ".json");
            return new Promise((resolve, reject) => {
                fs.readFile(layoutPath, 'utf8', (err, data) => {
                    if (err) {
                        logger.error('Error loading keyboard layout:', err);
                        reject(err);
                        return;
                    }
                    resolve(JSON.parse(data));
                });
            });
        } catch (error) {
            logger.error('Error in _getKeyboardLayout:', error.message);
            throw error;
        }
    },

    async _getFrequencyMap(fileName) {
        try {
            let frequencyListPath = path.join(this.pathToWordFrequencyCSVs, fileName + ".csv");
            return new Promise((resolve, reject) => {
                let frequencyMap = new Map();
                fs.createReadStream(frequencyListPath)
                    .pipe(csv())
                    .on('data', (csvRow) => {
                        let rowArray = [];
                        Object.keys(csvRow).forEach(key => {
                            rowArray.push(csvRow[key])
                        })
                        frequencyMap.set(rowArray[0], parseInt(rowArray[1], 10));
                    })
                    .on('end', () => {
                        frequencyMap.delete([...frequencyMap.keys()][0]); // removes the first element which is the csv header
                        resolve(frequencyMap);
                    })
                    .on('error', (err) => {
                        logger.error('Error reading frequency map CSV:', err);
                        reject(err);
                    });
            });
        } catch (error) {
            logger.error('Error in _getFrequencyMap:', error.message);
            throw error;
        }
    },

    _createTextboxArea(previousValue) {
        try {
            const textboxArea = document.createElement("div");
            textboxArea.classList.add("keyboard__textbox-area", "fadeInDown");

            let textarea;
            if (this.keyboardLayout.layout === KeyboardLayouts.NUMERIC || this.elementToUpdate.type === "password") {
                textarea = document.createElement("input");
                textarea.type = this.elementToUpdate.type;
                textarea.classList.add("keyboard__input");
            } else {
                textarea = document.createElement("textarea");
                textarea.classList.add("keyboard__textbox");
            }

            textarea.value = previousValue;
            textboxArea.appendChild(textarea);

            const arrowKeys = this._createArrowKeys();
            textboxArea.appendChild(arrowKeys);

            const closeButtonArea = document.createElement("div");
            closeButtonArea.classList.add("keyboard__closeButton-area", "fadeInDown");

            const closeButton = this._createKeyElement("close");
            closeButtonArea.appendChild(closeButton);

            if (this.elementToUpdate.type === "password") {
                const togglePasswordButton = this._createKeyElement("toggle-password");
                closeButtonArea.appendChild(togglePasswordButton);
                closeButtonArea.classList.add("keyboard__closeButton-area--wide");
                closeButton.classList.add("keyboard__key--equal");
                this.elements.togglePasswordButton = togglePasswordButton;
            }

            textboxArea.appendChild(closeButtonArea);

            this.elements.main.appendChild(textboxArea);
            this.elements.textarea = textarea;
            this.elements.textarea.focus();

            // Ensuring textarea stays focused by refocusing it if focus is lost
            this.elements.textarea.addEventListener("focusout", (event) => {
                setTimeout(() => this.elements.textarea.focus(), 0);
            });
        } catch (error) {
            logger.error('Error creating textbox area:', error.message);
        }
    },

    _createArrowKeys() {
        try {
            // If a numeric keyboard layout is used, the up and down arrow keys are not displayed
            let arrowKeysLayout = {
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
        } catch (error) {
            logger.error('Error creating arrow keys:', error.message);
        }
    },

    _createNumpadArea() {
        try {
            const addKeyElement = (key, container, ...classes) => {
                const keyElement = this._createKeyElement(key);
                keyElement.classList.add(...classes);
                container.appendChild(keyElement);
            };

            for (let i = 0; i < this.keyboardLayout.keys.length; i++) {
                const row = this.keyboardLayout.keys[i];
                const rowContainer = document.createElement("div");
                rowContainer.classList.add("keyboard__row", "fadeInUp");

                // Adding key before each row
                addKeyElement(this.properties.numpad_leftColumn[i], rowContainer, "keyboard__key--equal-width", "keyboard__key--darker");

                row.forEach(key => {
                    addKeyElement(key, rowContainer, "keyboard__key--equal-width");
                });

                // Adding key after each row
                addKeyElement(this.properties.numpad_rightColumn[i], rowContainer, "keyboard__key--equal-width");

                this.elements.main.appendChild(rowContainer);
            }
        } catch (error) {
            logger.error('Error creating numpad area:', error.message);
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
        try {
            const fragment = document.createDocumentFragment();

            // TOP ROW
            const topRow = ["settings", "suggestion_1", "suggestion_2", "suggestion_3", "delete letter", "delete word", "AC"]; // text would eventually be replaced with auto-complete suggestions
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
                bottomRow = ["?123", keys[0], "space", keys[1], "send", "submit"];
            } else {
                bottomRow = ["?123", ",", "space", ".", "send", "submit"];
            }

            // Adding ".com" key and removing "submit" key if the elementToUpdate is the omnibox
            if (this.elementToUpdate && this.elementToUpdate.id === "url") {
                bottomRow.splice(1, 0, ".com");
                bottomRow.pop();
            }

            const bottomRowContainer = document.createElement("div");
            bottomRowContainer.classList.add("keyboard__row");

            bottomRow.forEach(key => {
                const keyElement = this._createKeyElement(key, this.elementToUpdate.id === "url");
                bottomRowContainer.appendChild(keyElement);
            });
            fragment.appendChild(bottomRowContainer);

            return fragment;
        } catch (error) {
            logger.error('Error creating keys:', error.message);
        }
    },

    _createKeyElement(key, isUrl = false) {
        try {
            // These input types do not work when they are updated using RobotJS. Hence the value attribute is updated instead
            const INPUT_TYPES_NEEDING_VALUE_UPDATE = ['datetime-local', 'month', 'week'];
            const keyElement = document.createElement("button");

            // Add attributes/classes
            keyElement.setAttribute("type", "button");
            keyElement.classList.add("keyboard__key");

            // Prevent the key from gaining focus on mousedown so that the focus remains on the textarea
            keyElement.addEventListener("mousedown", (event) => {
                event.preventDefault();
            });

            switch (key) {
                case "arrow-home":
                    keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-once");
                    keyElement.innerHTML = this._createMaterialIcon("first_page");

                    dwell(keyElement, () => {
                        ipcRenderer.send('robot-keyboard-arrow-key', 'home');
                    }, true);

                    break;

                case "arrow-end":
                    keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-once");
                    keyElement.innerHTML = this._createMaterialIcon("last_page");

                    dwell(keyElement, () => {
                        ipcRenderer.send('robot-keyboard-arrow-key', 'end');
                    }, true);

                    break;

                case "arrow-up":
                    keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                    keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_up");

                    dwellInfinite(keyElement, () => {
                        ipcRenderer.send('robot-keyboard-arrow-key', 'up');
                    }, true);

                    break;

                case "arrow-down":
                    keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                    keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_down");

                    dwellInfinite(keyElement, () => {
                        ipcRenderer.send('robot-keyboard-arrow-key', 'down');
                    }, true);

                    break;

                case "arrow-left":
                    keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                    keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_left");

                    dwellInfinite(keyElement, () => {
                        ipcRenderer.send('robot-keyboard-arrow-key', 'left');
                    }, true);

                    break;

                case "arrow-right":
                    keyElement.classList.add("keyboard__key--arrow", "keyboard__key--dwell-infinite");
                    keyElement.innerHTML = this._createMaterialIcon("keyboard_arrow_right");

                    dwellInfinite(keyElement, () => {
                        ipcRenderer.send('robot-keyboard-arrow-key', 'right');
                    }, true);

                    break;

                case "close":
                    keyElement.classList.add("keyboard__key--darker", "keyboard__key--close", "keyboard__key--dwell-once");
                    keyElement.innerHTML = this._createMaterialIcon("close");

                    // This key must only be dwellable once!
                    dwell(keyElement, () => {
                        ipcRenderer.send('ipc-overlays-remove');
                    }, true);

                    break;

                // case "mic":
                //     keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-once");
                //     keyElement.innerHTML = this._createMaterialIcon("mic");

                //     dwell(keyElement, () => {
                //         // listen for voice input
                //     }, true);

                //     break;

                case "toggle-password":
                    keyElement.classList.add("keyboard__key--dwell-once", "keyboard__key--equal");
                    keyElement.innerHTML = this._createMaterialIcon(this.properties.isPasswordHidden ? "visibility_off" : "visibility");

                    dwell(keyElement, () => {
                        this.properties.isPasswordHidden = !this.properties.isPasswordHidden;
                        this.elements.togglePasswordButton.innerHTML = this._createMaterialIcon(this.properties.isPasswordHidden ? "visibility_off" : "visibility");
                        this.elements.textarea.type = this.properties.isPasswordHidden ? "password" : "text";
                    }, true);

                    break;

                case "suggestion_1":
                    keyElement.classList.add("keyboard__key--wider", "keyboard__key--dark");
                    keyElement.innerHTML = key;

                    dwellInfinite(keyElement, () => {
                        if (this.suggestions[0] === undefined) return;
                        this._deleteWord(false);
                        this._insertChar(this.suggestions[0] + " ");
                    }, true);

                    break;

                case "suggestion_2":
                    keyElement.classList.add("keyboard__key--wider", "keyboard__key--dark");
                    keyElement.innerHTML = key;

                    dwellInfinite(keyElement, () => {
                        if (this.suggestions[1] === undefined) return;
                        this._deleteWord(false);
                        this._insertChar(this.suggestions[1] + " ");
                    }, true);

                    break;

                case "suggestion_3":
                    keyElement.classList.add("keyboard__key--wider", "keyboard__key--dark");
                    keyElement.innerHTML = key;

                    dwellInfinite(keyElement, () => {
                        if (this.suggestions[2] === undefined) return;
                        this._deleteWord(false);
                        this._insertChar(this.suggestions[2] + " ");
                    }, true);

                    break;

                case "backspace":
                    keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                    keyElement.innerHTML = this._createMaterialIcon("backspace");

                    dwellInfinite(keyElement, () => {
                        if (this.keyboardLayout.layout !== KeyboardLayouts.NUMERIC) {
                            this._deleteChar();
                        } else {
                            ipcRenderer.send('robot-keyboard-backspace');
                        }
                    }, true);

                    break;

                case "delete letter":
                    keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                    keyElement.innerHTML = this._createCustomIcon("delete_letter");

                    dwellInfinite(keyElement, () => {
                        this._deleteChar();
                    }, true);

                    break;

                case "delete word":
                    keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                    keyElement.innerHTML = this._createCustomIcon("delete_word");

                    dwellInfinite(keyElement, () => {
                        this._deleteWord();
                    }, true);

                    break;

                case "AC":
                    keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-once");
                    keyElement.innerHTML = "AC";

                    dwell(keyElement, () => {
                        this.elements.textarea.value = "";

                        if (this.keyboardLayout.layout !== KeyboardLayouts.NUMERIC && this.elementToUpdate.type !== "password") {
                            // Update autocomplete suggestions
                            this.suggestions = this._getAutocompleteSuggestions(this.elements.textarea.value);
                            this._updateAutocompleteSuggestions();
                        }
                    }, true);

                    break;

                case "caps":
                    keyElement.classList.add("keyboard__key--darker", "keyboard__key--activatable", "keyboard__key--dwell-infinite");
                    if (this.keyboardLayout.layout !== KeyboardLayouts.NUMERIC) keyElement.classList.add("keyboard__key--wide");
                    keyElement.classList.toggle("keyboard__key--active", this.properties.capsLock);

                    /**
                     * This allows the virtual keyboard to dynamically switch between different icons based on the current state of 
                     * the keyboard. If the special keys are displayed (the "?123" button is clicked), the capslock icon changes to 
                     * "=\<" to signify that more special keys are available. 
                     */
                    if (this.properties.specialKeys) {
                        keyElement.textContent = "=\\<";
                    } else {
                        keyElement.innerHTML = this._createMaterialIcon("keyboard_capslock");
                    }

                    dwell(keyElement, () => {
                        this._toggleCapsLock();
                    }, true);

                    break;

                case "enter":
                    keyElement.classList.add("keyboard__key--darker", "keyboard__key--dwell-infinite");
                    if (this.keyboardLayout.layout !== KeyboardLayouts.NUMERIC) keyElement.classList.add("keyboard__key--wide");
                    keyElement.innerHTML = this._createMaterialIcon("keyboard_return");

                    dwellInfinite(keyElement, () => {
                        this._insertChar("\n");
                    }, true);

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

                    dwell(keyElement, () => {
                        this._toggleSpecialKeys();
                    }, true);

                    break;

                case "space":
                    keyElement.classList.add("keyboard__key--dwell-infinite");
                    if (this.keyboardLayout.layout !== KeyboardLayouts.NUMERIC) keyElement.classList.add("keyboard__key--widest");
                    keyElement.innerHTML = this._createMaterialIcon("space_bar");

                    dwellInfinite(keyElement, () => {
                        this._insertChar(" ");
                    }, true);

                    break;

                case "send":
                    keyElement.classList.add("keyboard__key--yellow-border", "keyboard__key--darker", "keyboard__key--dwell-once");
                    if (isUrl) keyElement.classList.add("keyboard__key--wider");
                    keyElement.innerHTML = this._createMaterialIcon("send");

                    dwell(keyElement, () => {
                        let submit = false;
                        let updateValueAttribute = false;
                        let valueToSend = this.elements.textarea.value

                        if (this.elementToUpdate) {
                            if (INPUT_TYPES_NEEDING_VALUE_UPDATE.includes(this.elementToUpdate.type)) {
                                updateValueAttribute = true;
                            } else if (this.elementToUpdate.type === "date") {
                                valueToSend = new Date(valueToSend).toLocaleDateString('en-GB'); // Format as DD/MM/YYYY// sending the keyboard value to render-mainwindow.js
                            }

                            console.log("elementToUpdate", this.elementToUpdate, "with text", valueToSend);
                            ipcRenderer.send('ipc-keyboard-input', valueToSend, this.elementToUpdate, submit, updateValueAttribute);
                        }
                    }, true);

                    break;

                case "submit":
                    keyElement.classList.add("keyboard__key--yellow-border", "keyboard__key--darker", "keyboard__key--dwell-once");
                    keyElement.innerHTML = this._createMaterialIcon("send_and_archive");

                    dwell(keyElement, () => {
                        let submit = true;
                        let updateValueAttribute = false;
                        let valueToSend = this.elements.textarea.value

                        if (this.elementToUpdate) {
                            if (INPUT_TYPES_NEEDING_VALUE_UPDATE.includes(this.elementToUpdate.type)) {
                                updateValueAttribute = true;
                            } else if (this.elementToUpdate.type === "date") {
                                valueToSend = new Date(valueToSend).toLocaleDateString('en-GB'); // Format as DD/MM/YYYY
                            }

                            // sending the keyboard value to render-mainwindow.js
                            console.log("elementToUpdate", this.elementToUpdate, "with text", valueToSend);
                            ipcRenderer.send('ipc-keyboard-input', valueToSend, this.elementToUpdate, submit, updateValueAttribute);
                        }
                    }, true);

                    break;

                default:
                    keyElement.classList.add("keyboard__key--dwell-infinite");
                    // Checks if the element type is "month" and display the month name next to the key
                    if (this.elementToUpdate.type === "month") {
                        const monthNames = [
                            "January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"
                        ];

                        // Parses the key as a number and uses it to get the month name
                        const monthIndex = parseInt(key, 10) - 1; // Subtract 1 because months are 0-indexed
                        if (!isNaN(monthIndex) && monthIndex >= 0 && monthIndex < 12) {
                            keyElement.textContent = `${key} (${monthNames[monthIndex]})`;
                        } else {
                            keyElement.textContent = key; // Fallback for non-numeric keys
                        }
                    } else {
                        keyElement.textContent = key;
                    }

                    dwellInfinite(keyElement, () => {
                        console.log('key:', key)
                        if (this.keyboardLayout.layout !== KeyboardLayouts.NUMERIC) {
                            this._insertChar(key);
                        } else {
                            console.log('robot-keyboard-numpad', key)
                            ipcRenderer.send('robot-keyboard-numpad', key);
                        }
                    }, true);

                    break;
            }

            return keyElement;
        } catch (error) {
            logger.error('Error creating key element:', error.message);
        }
    },

    _createMaterialIcon(icon_name) {
        return `<i class="material-icons--outlined-filled">${icon_name}</i>`;
    },

    _createCustomIcon(icon_name) {
        return `<i class="custom-icons">${icon_name}</i>`;
    },

    _toggleCapsLock() {
        try {
            this.properties.capsLock = !this.properties.capsLock;
            this._updateKeys();
        } catch (error) {
            logger.error('Error toggling caps lock:', error.message);
        }
    },

    _toggleSpecialKeys() {
        try {
            this.properties.specialKeys = !this.properties.specialKeys;

            // this ensures that the caps lock icon does not remian activated when switching to special keys
            this.properties.capsLock = this.properties.capsLock ? false : this.properties.capsLock;

            this._updateKeys();
        } catch (error) {
            logger.error('Error toggling special keys:', error.message);
        }
    },

    // Inserts the selected key into the textarea at the current cursor position and updates the cursor position
    _insertChar(key) {
        try {
            const textarea = this.elements.textarea;
            const currentPos = textarea.selectionStart;

            // Insert the letter(s) at the current cursor position
            const newValue = textarea.value.slice(0, currentPos) + key + textarea.value.slice(currentPos);

            // Update the textarea value and set the new cursor position
            textarea.value = newValue;
            const newCursorPos = currentPos + key.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);

            if (this.elementToUpdate.type !== "password") {
                // Update autocomplete suggestions
                this.suggestions = this._getAutocompleteSuggestions(textarea.value);
                this._updateAutocompleteSuggestions();
            }

            textarea.focus();
        } catch (error) {
            logger.error('Error inserting character in the textarea:', error.message);
        }
    },

    // Deletes the character from the textarea at the current cursor position and updates the cursor position
    _deleteChar() {
        try {
            const textarea = this.elements.textarea;
            const currentPos = textarea.selectionStart;
            // If the cursor is at the beginning, do nothing
            if (currentPos === 0) {
                return;
            }

            // Delete the character before the current cursor position
            const newValue = textarea.value.slice(0, currentPos - 1) + textarea.value.slice(currentPos);

            textarea.value = newValue;
            textarea.setSelectionRange(currentPos - 1, currentPos - 1);
            console.log("newPosition", currentPos - 1);
            textarea.focus();

            if (this.elementToUpdate.type !== "password") {
                // Update autocomplete suggestions
                this.suggestions = this._getAutocompleteSuggestions(this.elements.textarea.value);
                this._updateAutocompleteSuggestions();
            }
        } catch (error) {
            logger.error('Error deleting character:', error.message);
        }
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
     * 
     * If the cursor is at the end of a word that has whitespace succeeding it, the word will NOT be deleted.
     * E.g. "Hello, *cursor here*" -> "Hello, *cursor here*" (Nothing changes)
     */
    _deleteWord(update = true) {
        try {
            const textarea = this.elements.textarea;
            const currentPos = textarea.selectionStart;

            // If the cursor is at the beginning, do nothing
            if (currentPos === 0) {
                console.log("Cursor is at the beginning");
                return;
            }

            // Find the position of the last word before and including the cursor
            const beforeCursor = textarea.value.slice(0, currentPos);
            const afterCursor = textarea.value.slice(currentPos);
            const newValue = beforeCursor.replace(/\S*$/, '') + afterCursor.replace(/^\S*/, '');

            // Update the textarea value and set the new cursor position
            const deletedLength = beforeCursor.length - beforeCursor.replace(/\S*$/, '').length;
            const newCursorPos = currentPos - deletedLength;
            textarea.value = newValue;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            console.log("newPosition", newCursorPos);
            textarea.focus();

            if (update && this.elementToUpdate.type !== "password") {
                // Update autocomplete suggestions
                this.suggestions = this._getAutocompleteSuggestions(this.elements.textarea.value);
                this._updateAutocompleteSuggestions();
            }
        } catch (error) {
            logger.error('Error deleting word:', error.message);
        }
    },

    _openSettingsOverlay() {
        try {
            // Create and display the overlay
            const overlay = document.createElement("div");
            overlay.classList.add("keyboard__overlay");

            // Create and display the settings popup
            const popup = document.createElement("div");
            popup.classList.add("settings-popup");

            this.properties.languages.forEach(language => {
                const button = document.createElement("button");
                button.textContent = language.toUpperCase();

                dwellInfinite(button, async () => {
                    try {
                        this.keyboardLayout = await this._getKeyboardLayout(language);
                        this.frequencyMap = await this._getFrequencyMap(language);
                        await this._updateKeys();
                        ipcRenderer.send('ipc-keyboard-update-language', language);
                    } catch (error) {
                        logger.error('Failed to load keyboard layout:', error.message);
                    }
                    document.body.removeChild(popup);
                    document.body.removeChild(overlay);
                }, true);
                popup.appendChild(button);
            });

            document.body.appendChild(overlay);
            document.body.appendChild(popup);
        } catch (error) {
            logger.error('Error opening settings overlay:', error.message);
        }
    },

    async _updateKeys() {
        try {
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

            if (this.elementToUpdate.type === "password") {
                this.suggestions = ["", "", ""];
                this._updateAutocompleteSuggestions();
            } else if (this.keyboardLayout.layout !== KeyboardLayouts.NUMERIC) {
                // Set suggestions
                this.suggestions = this._getAutocompleteSuggestions(this.elements.textarea.value);
                this._updateAutocompleteSuggestions();
            }
        } catch (error) {
            logger.error('Error updating keys:', error.message);
        }
    },

    _getAutocompleteSuggestions(value) {
        try {
            // Get the cursor position and surrounding text
            const currentPos = this.elements.textarea.selectionStart;
            const beforeCursor = value.slice(0, currentPos);
            const afterCursor = value.slice(currentPos);

            // Extract the current word being typed
            const currentWord = beforeCursor.split(/\s+/).pop() + afterCursor.split(/\s+/).shift();
            const trimmedWord = currentWord.trim();

            let suggestions = Array.from(this.frequencyMap.keys())
                .filter(word => word.toLowerCase().startsWith(trimmedWord.toLowerCase()))
                .sort((a, b) => this.frequencyMap.get(b) - this.frequencyMap.get(a)) // Sorting by frequency
                .slice(0, 3) // Return the top 3 suggestions
                .map(word => this._matchCase(word, trimmedWord)); // Matching the case of the original trimmedWord

            return suggestions;
        } catch (error) {
            logger.error('Error getting autocomplete suggestions:', error.message);
        }
    },

    _matchCase(suggestedWord, reference) {
        try {
            console.log('reference', reference);
            suggestedWord = suggestedWord.charAt(0).toUpperCase() + suggestedWord.slice(1).toLowerCase(); // Capitalize the first letter and lowercase the rest

            if (reference === reference.toUpperCase() && reference.length > 1) {
                // If the word is all uppercase
                return suggestedWord.toUpperCase();
            } else if (reference === reference.toLowerCase()) {
                // If the word is all lowercase
                return suggestedWord.toLowerCase();
            } else if (reference.charAt(0) !== reference.charAt(0).toUpperCase()) {
                return suggestedWord.toLowerCase();
            }
            return suggestedWord;
        } catch (error) {
            logger.error('Error matching case for suggested word:', error.message);
        }
    },

    _updateAutocompleteSuggestions() {
        try {
            const topRowContainer = this.elements.keysContainer.querySelector('.keyboard__row');
            const suggestionKeys = topRowContainer.querySelectorAll('.keyboard__key');

            // Starting from the second key (index 1) to disregard the first key
            this.suggestions.forEach((suggestion, index) => {
                if (suggestionKeys[index + 1]) {
                    suggestionKeys[index + 1].textContent = suggestion;
                    if (!suggestionKeys[index + 1].classList.contains("keyboard__key--dwell-once")) {
                        suggestionKeys[index + 1].classList.add("keyboard__key--dwell-once");
                    }
                }
            });

            // Filling remaining keys with empty string if there are less than 3 suggestions
            for (let i = this.suggestions.length; i < 3; i++) {
                if (suggestionKeys[i + 1]) {
                    suggestionKeys[i + 1].textContent = "";
                    if (suggestionKeys[i + 1].classList.contains("keyboard__key--dwell-once")) {
                        suggestionKeys[i + 1].classList.remove("keyboard__key--dwell-once");
                    }
                }
            }
        } catch (error) {
            logger.error('Error updating autocomplete suggestions:', error.message);
        }
    }
};