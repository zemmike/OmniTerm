// OmniTerm preload — runs sandboxed and isolated. It only forwards the
// per-launch session token and build info to the renderer.
//
// The token arrives via `additionalArguments` (process.argv), which is the
// reliable channel inside a sandboxed preload; process.env is the fallback.
const { contextBridge, ipcRenderer } = require('electron');

const argToken = (process.argv || []).find((arg) => arg.startsWith('--omniterm-token='));
const TOKEN = argToken
  ? argToken.slice('--omniterm-token='.length)
  : (process.env.OMNITERM_TOKEN || '').trim();

const argVersion = (process.argv || []).find((arg) => arg.startsWith('--omniterm-version='));
const VERSION = argVersion
  ? argVersion.slice('--omniterm-version='.length)
  : process.env.OMNITERM_VERSION || '0.0.0';

contextBridge.exposeInMainWorld('omniterm', {
  token: TOKEN,
  // Clicking a link in the terminal goes through the main process, which
  // validates the scheme before handing it to the OS.
  openExternal: (url) => ipcRenderer.invoke('omniterm:open-external', String(url)),
  version: VERSION,
  platform: process.platform,
  isDesktop: true,
});
