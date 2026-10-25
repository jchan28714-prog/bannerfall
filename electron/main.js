const { app, BrowserWindow } = require('electron');
const path = require('path');

let win;

function createWindow() {
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: Math.min(1280, width),
    height: Math.min(720, height),
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#0f1117',
    fullscreen: false,
    fullscreenable: true,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAspectRatio(16 / 9);
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));

  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => { app.quit(); });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
