const { contextBridge, ipcRenderer } = require('electron');
const isDevelopment = process.env.NODE_ENV === "development";

contextBridge.exposeInMainWorld('cactusAPI', {
    getAppInfo: () => ipcRenderer.invoke('get-app-info')
});

ipcRenderer.invoke('get-tab-renderer-script').then((rendererScript) => {
    if (isDevelopment) debugger; //set a breakpoint
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.textContent = rendererScript;
    document.head.appendChild(script);
});
