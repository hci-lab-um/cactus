const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cactusAPI', {
    on: (channel, func) => {
        const validChannels = [
            'ipc-iframes-loaded',
            'ipc-main-tabview-loaded',
            'ipc-main-disconnect-mutation-observer',
            'ipc-main-reconnect-mutation-observer',
            'ipc-main-remove-scroll-buttons',
            'ipc-main-add-scroll-buttons',
            'ipc-clear-highlighted-elements',
            'ipc-highlight-available-elements',
            'ipc-tabview-update-scroll-distance',
            'ipc-tabview-keyboard-input',
            'ipc-tabview-scrolldown',
            'ipc-tabview-scrollup',
            'ipc-tabview-create-quadtree',
            'ipc-tabview-forward',
            'ipc-tabview-back',
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },

    onAsync: (channel, func) => {
        const validChannels = [
            'ipc-tabview-set-element-value',
            'ipc-tabview-highlight-elements'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, async (event, ...args) => func(...args));
        }
    },

    send: (channel, data) => {
        const validChannels = [
            'ipc-tabview-generateQuadTree',
            'ipc-tabview-generateNavAreasTree',
            'ipc-tabview-clear-sidebar',
            'ipc-tabview-cursor-mouseover',
            'ipc-tabview-cursor-mouseout',
            'ipc-tabview-visible-clickable-elements',
            'ipc-tabview-document-info',
            'robot-keyboard-type',
            'robot-keyboard-enter',
            'robot-keyboard-spacebar'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },

    logError: (message) => {
        ipcRenderer.send('ipc-log-error-message', message);
    }
});