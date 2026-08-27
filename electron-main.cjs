const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let serverProcess = null;
const PORT = process.env.PORT || 3000;

function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else {
          retry();
        }
      }).on('error', retry);
    }

    function retry() {
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for server at ${url}`));
      } else {
        setTimeout(check, 300);
      }
    }

    check();
  });
}

function startBackendServer() {
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    // In dev, the tsx server is already handled by npm run dev or started separately
    return;
  }

  const serverScript = path.join(__dirname, 'dist', 'server.cjs');
  serverProcess = spawn(process.execPath || 'node', [serverScript], {
    env: { ...process.env, NODE_ENV: 'production', PORT: PORT.toString() },
    stdio: 'inherit',
    cwd: __dirname,
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start OmniTerm backend server:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: 'OmniTerm - DevTerminal Pro',
    backgroundColor: '#0F0F10',
    darkTheme: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Remove default menu for sleek terminal look
  Menu.setApplicationMenu(null);

  const targetUrl = `http://localhost:${PORT}`;

  waitForServer(targetUrl)
    .then(() => {
      mainWindow.loadURL(targetUrl);
      mainWindow.once('ready-to-show', () => {
        mainWindow.show();
      });
    })
    .catch((err) => {
      console.error(err);
      // Fallback direct load attempt
      mainWindow.loadURL(targetUrl);
      mainWindow.show();
    });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});
