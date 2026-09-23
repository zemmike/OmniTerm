/** Telling web links from file paths, shared by the terminal and the AI Reader. */

// Common top-level domains. A bare `name.tld` or `name.tld/path` with one of these is a
// web address; `notes.md` or `src/app.ts` is not, because their endings are not here.
const TLD =
  /\.(?:com|org|net|io|ai|dev|app|co|gov|edu|info|me|us|uk|de|fr|eu|ca|au|jp|cn|in|ru|nl|ch|se|no|xyz|tech|cloud|so|gg|tv|ly|sh)$/i;

/** A scheme URL (`https://`, `ftp://`, `mailto:`) or a `www.` address. */
export const URL_AT = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)[^\s<>"'`]+/i;

/** Does this token read as a web address rather than a file path? */
export function isWebLink(token: string): boolean {
  const value = token.replace(/[),.;:!?\]'"]+$/, '');
  if (!value) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^www\./i.test(value) || /^mailto:/i.test(value)) {
    return true;
  }
  // Paths that are explicitly local never count as hosts.
  if (/^(?:\.{0,2}\/|~|[A-Za-z]:\|\\)/.test(value)) return false;
  const host = value.split(/[/?#]/)[0].replace(/:\d+$/, '');
  return /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(host) && TLD.test(host);
}

/** The URL to open for a web-link token (adds https:// to bare addresses). */
export function toHref(token: string): string {
  const value = token.replace(/[),.;:!?\]'"]+$/, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

/** Open a URL through the desktop shell (it validates the scheme); fall back to a tab. */
export function openExternal(url: string): void {
  const bridge = (window as unknown as { omniterm?: { openExternal?: (u: string) => unknown } })
    .omniterm;
  if (typeof bridge?.openExternal === 'function') {
    void bridge.openExternal(url);
    return;
  }
  if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
}
