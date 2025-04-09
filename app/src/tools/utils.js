const { throttle } = require('lodash')
const { ipcRenderer } = require('electron')
const { Settings } = require('./enums.js');

let dwellTime;
let keyboardDwellTime;
let intervalIds = []; // this is needed because some keys create multiple intervals and hence all of them need to be cleared on mouseout
let eventListeners = new Map(); // Store event listeners for detachment

function updateAnimations(elem, isClicked = false) {
    elem.classList.add('keydown');
    if (isClicked) elem.classList.add('clicked');

    setTimeout(() => {
        elem.classList.remove('keydown');
    }, 300);
}

function addEventListenerWithTracking(elem, event, listener) {
    if (!eventListeners.has(elem)) {
        eventListeners.set(elem, []);
    }
    eventListeners.get(elem).push({ event, listener });
    elem.addEventListener(event, listener);
}

function removeEventListeners(elem) {
    if (eventListeners.has(elem)) {
        eventListeners.get(elem).forEach(({ event, listener }) => {
            elem.removeEventListener(event, listener);
        });
        eventListeners.delete(elem);
    }
}

module.exports = {
    byId: (id) => {
        return document.getElementById(id);
    },

    readFile: (file, callback) => {
        var rawFile = new XMLHttpRequest()
        rawFile.open("GET", file, true)

        rawFile.onreadystatechange = () => {
            if (rawFile.readyState === 4) {
                if (rawFile.status === 200 || rawFile.status == 0) {
                    callback(rawFile.responseText, null)
                }
            }
        }
        rawFile.send(null)
    },

    dwell: async (elem, callback, isKeyboardBtn = false) => {
        try {
            dwellTime = await ipcRenderer.invoke('ipc-get-user-setting', Settings.DWELL_TIME.NAME);
            keyboardDwellTime = await ipcRenderer.invoke('ipc-get-user-setting', Settings.KEYBOARD_DWELL_TIME.NAME);

            // If the dwelling is for a keyboard button, use the keyboard dwell time, otherwise use the default dwell time
            let dwellTimeToUse = isKeyboardBtn ? keyboardDwellTime : dwellTime;

            let throttledFunction = throttle(() => {
                callback();
                if (isKeyboardBtn) updateAnimations(elem);
            }, dwellTimeToUse, { leading: false, trailing: true });

            // Click Event - Bypasses dwelling in case a switch is being used
            addEventListenerWithTracking(elem, 'click', () => {
                throttledFunction.cancel();
                callback();
                if (isKeyboardBtn) updateAnimations(elem, true);
            });

            // Mouse enter and mouse leave - Through which the dwelling functonality is implemented
            addEventListenerWithTracking(elem, 'mouseenter', () => {
                throttledFunction();
            });

            addEventListenerWithTracking(elem, 'mouseleave', () => {
                throttledFunction.cancel();
                if (isKeyboardBtn) elem.classList.remove('clicked');
            });
        } catch (err) {
            console.error('Error getting dwell time:', err.message);
        }
    },

    // Since this is only used in the render-keyboard.js, it can be removed from here
    dwellInfinite: async (elem, callback, isKeyboardBtn = false, sidebarInterval = null) => {
        try {
            let dwellTimeToUse = null; // This will be set based on the context (keyboard or sidebar)
            
            if (!sidebarInterval) {
                dwellTime = await ipcRenderer.invoke('ipc-get-user-setting', Settings.DWELL_TIME.NAME);
                keyboardDwellTime = await ipcRenderer.invoke('ipc-get-user-setting', Settings.KEYBOARD_DWELL_TIME.NAME);

                // If the dwelling is for a keyboard button, use the keyboard dwell time, otherwise use the default dwell time
                dwellTimeToUse = isKeyboardBtn ? keyboardDwellTime : dwellTime;       
            } else {
                dwellTimeToUse = sidebarInterval;
            }            

            // Click Event - Bypasses dwelling in case a switch is being used
            addEventListenerWithTracking(elem, 'click', () => {
                if (intervalIds.length !== 0) {
                    intervalIds.forEach(intervalId => {
                        clearInterval(intervalId);
                    });
                    intervalIds = [];
                }
                callback();
                if (isKeyboardBtn) updateAnimations(elem, true);
            });

            // Start dwelling on mouseover
            addEventListenerWithTracking(elem, 'mouseenter', () => {
                // Clears any existing intervals to avoid multiple intervals running simultaneously
                if (intervalIds.length !== 0) {
                    intervalIds.forEach(intervalId => {
                        clearInterval(intervalId);
                    });
                }

                intervalIds.push(setInterval(() => {
                    callback();
                    if (isKeyboardBtn) updateAnimations(elem);  
                }, dwellTimeToUse));
            });

            // Stop dwelling on mouse leave
            addEventListenerWithTracking(elem, 'mouseleave', () => {
                if (intervalIds.length !== 0) {
                    intervalIds.forEach(intervalId => {
                        clearInterval(intervalId);
                    });
                    intervalIds = [];
                }

                if (isKeyboardBtn) elem.classList.remove('clicked');
            });
        } catch (err) {
            console.error('Error getting keyboard dwell time:', err.message);
        }
    },

    detachDwellListeners: (elem) => {
        removeEventListeners(elem);
    },

    detachAllDwellListeners: () => {
        eventListeners.forEach((listeners, elem) => {
            listeners.forEach(({ event, listener }) => {
                elem.removeEventListener(event, listener);
            });
        });
        eventListeners.clear();
    },

    genId: () => {
    return '_' + Math.random().toString(36).substr(2, 9)
    },

    // The following method is duplicated in the render-tabview.js - the only place that uses it, hence it can be removed from here
    // generateUUID: () => {
    //   return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    //     const r = Math.random() * 16 | 0;
    //     const v = c === 'x' ? r : (r & 0x3 | 0x8);
    //     return v.toString(16);
    //   });
    // },

    isElementANavElement: element => {
        var parentNav = element.closest('nav')
        var parentRoleNav = element.closest('div[role="navigation"]')

        return (parentNav || parentRoleNav) ? true : false
    },

    // This function was only used in the render-browserview, hence it can be removed from here as it is now placed in render-tabview
    // scrollBy: (amountX, amountY) => {

    //   //This is an ugly solution to a problem whereby on certain pages, document.body.scrollBy works (e.g. wikipedia) and in others document.documentElement.scrollby does (e.g. times)
    //   document.body.scrollBy({
    //     top: amountY,
    //     left: amountX,
    //     behavior: "smooth"
    //   });

    //   document.documentElement.scrollBy({
    //     top: amountY,
    //     left: amountX,
    //     behavior: "smooth"
    //   });
    // }
}
