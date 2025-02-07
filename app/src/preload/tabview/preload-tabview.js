const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cactusAPI', {
    on: (channel, func) => {
        const validChannels = [
            'ipc-iframe-loaded',
            'ipc-main-tabview-loaded',
            'ipc-clear-highlighted-elements',
            'ipc-highlight-available-elements',
            'ipc-tabview-keyboard-input',
            'ipc-trigger-click-under-cursor',
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
            'ipc-tabview-click-element',
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
            'ipc-tabview-cursor-mouseover',
            'ipc-tabview-cursor-mouseout',
            'ipc-tabview-visible-clickable-elements',
            'ipc-tabview-document-info',
            'browse-to-url',
            'robot-keyboard-type',
            'robot-keyboard-enter',
            'robot-keyboard-spacebar'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    }
});