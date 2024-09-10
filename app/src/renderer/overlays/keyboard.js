const { ipcRenderer } = require('electron');
const config = require('config');
const fs = require('fs');
const path = require('path');
const { dwell } = require('../../../src/tools/utils');
const { createCursor, followCursor } = require('../../../src/tools/cursor')
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
        keys: []
    },

    eventHandlers: {
        oninput: null,
        onclose: null
    },

    properties: {
        value: "",
        capsLock: false
    },

    init() {
        // Create main elements
        this.elements.main = document.getElementById("keyboard-container");
        this.elements.keysContainer = document.createElement("div");

        // Setup main elements
        this.elements.main.classList.add("keyboard");
        this.elements.keysContainer.classList.add("keyboard__keys");

        this.elements.keys = this.elements.keysContainer.querySelectorAll(".keyboard__key");

        // Add to DOM
        this.elements.keysContainer.appendChild(this._createKeys());
        this.elements.main.appendChild(this.elements.keysContainer);

        // Automatically use keyboard for elements with .use-keyboard-input
        document.querySelectorAll(".use-keyboard-input").forEach(element => {
            element.addEventListener("focus", () => {
                this.open(element.value, currentValue => {
                    element.value = currentValue;
                });
            });
        });
    },

    _createKeys() {
        const fragment = document.createDocumentFragment();
        const keyLayout = [
            ["mic", "text", "text", "text", "text", "backspace", "AC"],
            ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
            ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
            ["caps", "z", "x", "c", "v", "b", "n", "m", "enter"],
            ["settings", "?123", ",", "space", ".", "done"]
        ];

        // Creates HTML for an icon
        const createIconHTML = (icon_name) => {
            return `<i class="material-icons">${icon_name}</i>`;
        };

        keyLayout.forEach(row => {
            const rowContainer = document.createElement("div");
            rowContainer.classList.add("keyboard__row");

            row.forEach(key => {
                const keyElement = document.createElement("button");
    
                // Add attributes/classes
                keyElement.setAttribute("type", "button");
                keyElement.classList.add("keyboard__key");
    
                switch (key) {
                    case "AC":
                        keyElement.classList.add("keyboard__key--darker");
                        keyElement.innerHTML = "AC";
    
                        keyElement.addEventListener("click", () => {
                            // insert the whole word in the text field
                        });
    
                        break;
                    
                    case "text":
                        keyElement.classList.add("keyboard__key--wider", "keyboard__key--dark");
                        keyElement.innerHTML = "text";
    
                        keyElement.addEventListener("click", () => {
                            // insert the whole word in the text field
                        });
    
                        break;
                    
                    case "backspace":
                        keyElement.classList.add("keyboard__key--darker");
                        keyElement.innerHTML = createIconHTML("backspace");
    
                        keyElement.addEventListener("click", () => {
                            this.properties.value = this.properties.value.substring(0, this.properties.value.length - 1);
                            this._triggerEvent("oninput");
                        });
    
                        break;
    
                    case "caps":
                        keyElement.classList.add("keyboard__key--wide", "keyboard__key--darker", "keyboard__key--activatable");
                        keyElement.innerHTML = createIconHTML("keyboard_capslock");
    
                        keyElement.addEventListener("click", () => {
                            this._toggleCapsLock();
                            keyElement.classList.toggle("keyboard__key--active", this.properties.capsLock);
                        });
    
                        break;
    
                    case "enter":
                        keyElement.classList.add("keyboard__key--wide",  "keyboard__key--darker");
                        keyElement.innerHTML = createIconHTML("keyboard_return");
    
                        keyElement.addEventListener("click", () => {
                            this.properties.value += "\n";
                            this._triggerEvent("oninput");
                        });
    
                        break;
    
                    case "space":
                        keyElement.classList.add("keyboard__key--widest");
                        keyElement.innerHTML = createIconHTML("space_bar");
    
                        keyElement.addEventListener("click", () => {
                            this.properties.value += " ";
                            this._triggerEvent("oninput");
                        });
    
                        break;
    
                    case "done":
                        keyElement.classList.add("keyboard__key--wider", "keyboard__key--yellow-border", "keyboard__key--darker");
                        keyElement.innerHTML = createIconHTML("check_circle");
    
                        keyElement.addEventListener("click", () => {
                            this.close();
                            this._triggerEvent("onclose");
                        });
    
                        break;
    
                    case "settings":
                        keyElement.classList.add("keyboard__key--darker");
                        keyElement.innerHTML = createIconHTML("settings");
    
                        keyElement.addEventListener("click", () => {
                            // displays settings popup
                        });
    
                        break;
    
                    case "?123":
                        keyElement.classList.add("keyboard__key--darker");
                    keyElement.innerHTML = "?123";
    
                        keyElement.addEventListener("click", () => {
                            // switch to special keys
                        });
    
                        break;
    
                    case "mic":
                        keyElement.classList.add("keyboard__key--darker");
                    keyElement.innerHTML = createIconHTML("mic");
    
                        keyElement.addEventListener("click", () => {
                            // switch to special keys
                        });
    
                        break;
    
                    default:
                        keyElement.textContent = key.toLowerCase();
    
                        keyElement.addEventListener("click", () => {
                            this.properties.value += this.properties.capsLock ? key.toUpperCase() : key.toLowerCase();
                            this._triggerEvent("oninput");
                        });
    
                        break;
                }
    
                rowContainer.appendChild(keyElement);  
            });
    
            fragment.appendChild(rowContainer);
        });
        
        return fragment;
    },

    _triggerEvent(handlerName) {
        if (typeof this.eventHandlers[handlerName] == "function") {
            this.eventHandlers[handlerName](this.properties.value);
        }
    },

    _toggleCapsLock() {
        this.properties.capsLock = !this.properties.capsLock;

        for (const key of this.elements.keys) {
            if (key.childElementCount === 0) {
                key.textContent = this.properties.capsLock ? key.textContent.toUpperCase() : key.textContent.toLowerCase();
            }
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
    }
};

ipcRenderer.on('ipc-main-keyboard-loaded', () => {
    Keyboard.init();
});
