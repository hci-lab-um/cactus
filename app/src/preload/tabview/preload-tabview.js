const { contextBridge, ipcRenderer } = require('electron');
const isDevelopment = process.env.NODE_ENV === "development";

contextBridge.exposeInMainWorld('cactusAPI', {  
    on: (channel, func) => {
        const validChannels = [
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
            'browse-to-url'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {    
    ipcRenderer.invoke('get-tab-renderer-script').then((rendererScript) => {
        const policy = window.trustedTypes.createPolicy('default', {
            // The following method simply returns the input as is, without any  
            // sanitization but creates a TrustedScript wrapper around the content.
            createScript: (input) => input,
            // createScriptURL: (input) => input //<- neeeded when logging into gmail
        });

        const script = document.createElement('script');
        script.type = 'text/javascript';
        // Set the script content using the trusted script created by the policy
        script.textContent = policy.createScript(rendererScript);
        document.head.appendChild(script);
    })
    .catch((error) => {
        console.error('preload-tabview.js: Error invoking get-tab-renderer-script', error);
    });
});
