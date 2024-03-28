const { ipcRenderer }           = require('electron')


ipcRenderer.on('browserViewLoaded', () => {
    //alert('hello');
});


var _browser_zoomLevel = 0
var _browser_maxZoom = 9
var _browser_minZoom = -8

ipcRenderer.on('zoomIn', () => {
  if (_browser_maxZoom > _browser_zoomLevel) {
    _browser_zoomLevel += 0.75
  }
  //webFrame.setZoomLevel(_browser_zoomLevel)
})

ipcRenderer.on('zoomOut', () => {
  if (_browser_minZoom < _browser_zoomLevel) {
    _browser_zoomLevel -= 0.75
  }
  //webFrame.setZoomLevel(_browser_zoomLevel)
})

ipcRenderer.on('zoomReset', () => {
  _browser_zoomLevel = 0
  //webFrame.setZoomLevel(_browser_zoomLevel)
})