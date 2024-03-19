const { ipcRenderer }           = require('electron')


ipcRenderer.on('browserViewLoaded', () => {
    //alert('hello');
});