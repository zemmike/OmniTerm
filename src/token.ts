/**
 * Shared per-launch session token (set by preload.cjs in the desktop shell, or
 * passed as ?omniterm_token= when the UI is opened in a plain browser).
 */
export const OMNITERM_TOKEN =
  (window as unknown as { omniterm?: { token?: string } }).omniterm?.token ||
  new URLSearchParams(window.location.search).get('omniterm_token') ||
  '';

export const IS_DESKTOP = Boolean((window as unknown as { omniterm?: { isDesktop?: boolean } }).omniterm?.isDesktop);
