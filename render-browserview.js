const { ipcRenderer }           = require('electron')
const { createCursor, followCursor } = require('./js/cursor')
const { byId, readFile, dwell } = require('./js/utils')

let cursor; 
let browserView;

ipcRenderer.on('browserViewLoaded', () => {
    createCursor('cursor');
    cursor = document.getElementById('cursor');
    followCursor('cursor');

    browserView = document.getRootNode();
  
    browserView.addEventListener('mouseout', () => {
        cursor.style.visibility = 'hidden'
    })

    browserView.addEventListener('mouseover', () => {
        cursor.style.visibility = 'visible'
    })
  });

  ipcRenderer.on('browserViewScrollDown', () => {
    document.documentElement.scrollBy(0, 20);
  })

  ipcRenderer.on('browserViewScrollUp', () => {
    document.documentElement.scrollBy(0, -20);
  })