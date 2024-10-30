const { contextBridge, ipcRenderer } = require('electron');
const isDevelopment = process.env.NODE_ENV === "development";

contextBridge.exposeInMainWorld('cactusAPI', {  
    on: (channel, func) => {
        const validChannels = [
            'ipc-main-browserview-loaded',
            'ipc-clear-highlighted-elements',
            'ipc-highlight-available-elements',
            'ipc-browserview-keyboard-input',
            'ipc-trigger-click-under-cursor',
            'ipc-browserview-scrolldown',
            'ipc-browserview-scrollup',
            'ipc-browserview-create-quadtree',
            'ipc-browserview-forward',
            'ipc-browserview-back',
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },

    onAsync: (channel, func) => {
        const validChannels = [
            'ipc-browserview-click-element',
            'ipc-browserview-highlight-elements'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, async (event, ...args) => func(...args));
        }
    },

    send: (channel, data) => {
        const validChannels = [
            'ipc-browserview-generateQuadTree',
            'ipc-browserview-generateNavAreasTree',
            'ipc-browserview-cursor-mouseover',
            'ipc-browserview-cursor-mouseout',
            'ipc-browserview-visible-clickable-elements',
            'ipc-browserview-document-info',
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
        console.error('preload-browserview.js: Error invoking get-tab-renderer-script', error);
    });
});
