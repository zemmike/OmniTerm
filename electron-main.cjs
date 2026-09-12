/**
 * OmniTerm desktop shell (Electron main process).
 *
 * Responsibilities:
 *  1. pick a free loopback port,
 *  2. boot the bundled Express API (`dist/server.cjs`) inside Electron's own
 *     Node runtime (ELECTRON_RUN_AS_NODE, so no system Node.js is required),
 *  3. hand the renderer a per-launch session token,
 *  4. shut the backend down cleanly when the window closes.
 */
const { app, BrowserWindow, Menu, shell, dialog, nativeImage, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');

// Fixed token when explicitly provided (kiosk / scripted setups), random otherwise.
const TOKEN = (process.env.OMNITERM_TOKEN || '').trim() || crypto.randomBytes(32).toString('hex');
const VERSION = app.getVersion();

// `omniterm --version` answers without opening a window. The troubleshooting
// guide and the bug-report template both ask for the version, and until now
// nothing handled the flag: `omniterm --version` launched the whole app instead.
// Exiting before app.whenReady() also means it works with no display attached.
if (process.argv.slice(1).some((arg) => arg === '--version' || arg === '-v')) {
  process.stdout.write(`${app.getName()} ${VERSION}\n`);
  process.exit(0);
}
// Optional landing tab (e.g. OMNITERM_START_TAB=backups) — handy for kiosk
// setups and for automated UI checks.
const START_TAB = (process.env.OMNITERM_START_TAB || '').trim();

let mainWindow = null;
let serverProcess = null;
let serverPort = null;
let logStream = null;

// --------------------------------------------------------------------- logging
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(' ')}\n`;
  process.stdout.write(line);
  if (logStream) logStream.write(line);
}

/**
 * True only for URLs served by our own backend on loopback. Used to decide
 * whether a frame may use the preload bridge and whether the window is allowed
 * to navigate. Anything that does not parse, or points anywhere else, is false —
 * the safe answer for a privileged window.
 */
function isLocalAppUrl(value) {
  if (!value) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const loopback =
    url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  return loopback && (url.protocol === 'http:' || url.protocol === 'https:');
}

function openLogFile() {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    logStream = fs.createWriteStream(path.join(dir, 'omniterm.log'), { flags: 'a' });
  } catch {
    logStream = null;
  }
}

// ---------------------------------------------------------------- free port
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeout = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => req.destroy(new Error('timeout')));
    };
    const retry = () => {
      if (Date.now() - start > timeout)
        reject(new Error(`Backend did not answer on ${url} within ${timeout}ms`));
      else setTimeout(check, 250);
    };
    check();
  });
}

// ------------------------------------------------------------------- backend
function startBackendServer() {
  const serverScript = path.join(__dirname, 'dist', 'server.cjs');
  if (!fs.existsSync(serverScript)) {
    throw new Error(
      `Backend bundle missing: ${serverScript}\nRun "npm run build" before starting the desktop app.`,
    );
  }

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: app.getPath('userData'),
    env: {
      ...process.env,
      // Make Electron's binary behave like plain Node for the backend process.
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(serverPort),
      OMNITERM_HOST: '127.0.0.1',
      OMNITERM_TOKEN: TOKEN,
      OMNITERM_VERSION: VERSION,
      OMNITERM_CWD: os.homedir(),
      OMNITERM_DISTRO: process.env.OMNITERM_DISTRO || '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => log('[server]', d.toString().trim()));
  serverProcess.stderr.on('data', (d) => log('[server:err]', d.toString().trim()));
  serverProcess.on('error', (err) => log('[server] spawn failed:', err.message));
  serverProcess.on('exit', (code, signal) => log(`[server] exited code=${code} signal=${signal}`));
}

function stopBackendServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  serverProcess = null;
}

// -------------------------------------------------------------------- window
function appIcon() {
  const candidates = [
    path.join(__dirname, 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
  ];
  for (const file of candidates) {
    try {
      if (file && fs.existsSync(file)) return nativeImage.createFromPath(file);
    } catch {
      /* keep looking */
    }
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    title: `OmniTerm ${VERSION}`,
    backgroundColor: '#0F0F10',
    darkTheme: true,
    show: false,
    icon: appIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--omniterm-token=${TOKEN}`, `--omniterm-version=${VERSION}`],
    },
  });

  // The app ships its own in-window chrome; drop Electron's default menu.
  Menu.setApplicationMenu(null);

  const targetUrl = `http://127.0.0.1:${serverPort}${START_TAB ? `?tab=${encodeURIComponent(START_TAB)}` : ''}`;

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  waitForServer(`${targetUrl}/api/health`)
    .then(() => {
      log(`[main] backend ready, loading ${targetUrl}`);
      return mainWindow.loadURL(targetUrl);
    })
    .catch((err) => {
      log('[main] backend not ready:', err.message);
      mainWindow.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            `<body style="background:#0f0f10;color:#e5e7eb;font:14px system-ui;padding:2rem">
               <h2>OmniTerm could not start its backend</h2>
               <pre>${err.message}</pre>
               <p>See the log in ${app.getPath('userData')}/omniterm.log</p>
             </body>`,
          ),
      );
      mainWindow.show();
    });

  // A privileged window must never navigate away from the local app: a redirect,
  // a crafted link or a future remote feature would otherwise leave the preload
  // bridge attached to foreign content. Open externally instead of navigating.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    log(`[main] blocked navigation to ${url}`);
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  // No page in this app needs camera, microphone, geolocation, notifications or
  // the clipboard-read permission; deny by default rather than inheriting
  // Chromium's defaults.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    log(`[main] denied permission request: ${permission}`);
    callback(false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -------------------------------------------------------------------- wiring
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('window-all-closed', () => {
    stopBackendServer();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', stopBackendServer);
  process.on('exit', stopBackendServer);

  /**
   * Opening a link from terminal output. Terminal output is attacker-controlled
   * (an SSH banner, a log line, a program's error message), so only schemes that
   * cannot execute anything locally are accepted: http and https go to the
   * browser. `file:` is deliberately NOT allowed — it hands a path to the
   * desktop's MIME handler, which is how a crafted `.desktop` file or script gets
   * run, and it has been a real terminal-emulator RCE vector. Nothing in the UI
   * needs it: the terminal link detector only ever emits http(s).
   */
  ipcMain.handle('omniterm:open-external', (event, rawUrl) => {
    // Refuse anything that is not the app's own window. Today there is exactly
    // one local window, but "the renderer is the only caller" is an assumption
    // worth enforcing rather than trusting (a future webview, an iframe, or a
    // devtools call from another origin would otherwise inherit this bridge).
    if (!isLocalAppUrl(event.senderFrame?.url)) {
      log(`[main] refused open-external from a foreign frame: ${event.senderFrame?.url}`);
      return false;
    }

    const value = String(rawUrl || '');
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    shell.openExternal(parsed.toString());
    return true;
  });

  app.whenReady().then(async () => {
    openLogFile();
    log(
      `[main] OmniTerm ${VERSION} starting on ${process.platform} (electron ${process.versions.electron})`,
    );
    try {
      serverPort = await findFreePort();
      log(`[main] loopback port ${serverPort}`);
      startBackendServer();
    } catch (err) {
      dialog.showErrorBox('OmniTerm', err.message);
      app.quit();
      return;
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
