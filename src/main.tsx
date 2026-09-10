import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ---------------------------------------------------------------------------
// OmniTerm runs a loopback API that executes real shell commands. The desktop
// shell hands the renderer a per-launch session token (preload.cjs); we attach
// it to every /api call so no other local page can drive the terminal.
// ---------------------------------------------------------------------------
const OMNITERM_TOKEN =
  (window as unknown as { omniterm?: { token?: string } }).omniterm?.token ||
  new URLSearchParams(window.location.search).get('omniterm_token') ||
  '';

if (OMNITERM_TOKEN) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.includes('/api/')) {
      const headers = new Headers(init.headers || {});
      headers.set('x-omniterm-token', OMNITERM_TOKEN);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
