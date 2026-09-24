/**
 * Clipboard access for the terminal.
 *
 * In the desktop app the page's own clipboard API is unreliable (Electron refuses
 * writes without a recognised gesture and the clipboard-read permission is denied),
 * so both directions go through the main-process bridge. The browser API remains the
 * fallback for the web build.
 */
interface ClipboardBridge {
  writeClipboard?: (text: string) => Promise<{ ok?: boolean } | undefined>;
  readClipboard?: () => Promise<{ ok?: boolean; text?: string } | undefined>;
}

function bridge(): ClipboardBridge | undefined {
  return (window as unknown as { omniterm?: ClipboardBridge }).omniterm;
}

export async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;
  const b = bridge();
  if (b?.writeClipboard) {
    try {
      const result = await b.writeClipboard(text);
      if (result?.ok) return true;
    } catch {
      /* fall through to the browser API */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readClipboardText(): Promise<string> {
  const b = bridge();
  if (b?.readClipboard) {
    try {
      const result = await b.readClipboard();
      if (result?.ok) return result.text || '';
    } catch {
      /* fall through to the browser API */
    }
  }
  try {
    return (await navigator.clipboard.readText()) || '';
  } catch {
    return '';
  }
}

/** Decode an OSC 52 payload (`c;<base64>`) as a program's request to set the clipboard. */
export function decodeOsc52(data: string): string | null {
  const sep = data.indexOf(';');
  if (sep < 0) return null;
  // Some programs wrap long base64 or use the URL-safe alphabet; normalise both.
  const payload = data
    .slice(sep + 1)
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  // `?` is a read request; never answer it, terminal output must not read the clipboard.
  if (!payload || payload === '?') return null;
  try {
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
