const { app, BrowserWindow, ipcMain, BrowserView } = require('electron');
const path = require('path');

let mainWindow;
let browserView;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.maximize();
  mainWindow.loadURL('file://' + __dirname + '/index.html');

  mainWindow.webContents.openDevTools();

  // Create the BrowserView instance after the app is ready
  browserView = new BrowserView();
  mainWindow.setBrowserView(browserView);

  // browserView.setBounds({ x: 0, y: 0, width: 1200, height: 800 });

  // browserView.setAutoResize({ width: true, height: true });

  //
  browserView.webContents.loadURL('https://www.google.com');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
});

ipcMain.on('getBrowserViewInstance', (event) => {
  event.sender.send('browserViewInstance', browserView);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
  });
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.on('getLinks', (event, message) => {
  mainWindow.webContents.send('getLinks', message);
});

ipcMain.on('getNavLinks', (event, message) => {
  mainWindow.webContents.send('getNavLinks', message);
});

ipcMain.on('loadBookmark', (event, message) => {
  mainWindow.webContents.send('loadBookmark', message);
});

ipcMain.on('closeBookmarks', (event, message) => {
  mainWindow.webContents.send('closeBookmarks', message);
});

ipcMain.on('hideScrollUp', () => {
  mainWindow.webContents.send('hideScrollUp');
});

ipcMain.on('log', (event, log) => {
  console.log(log);
});

ipcMain.on('showScrollUp', () => {
  mainWindow.webContents.send('showScrollUp');
});
