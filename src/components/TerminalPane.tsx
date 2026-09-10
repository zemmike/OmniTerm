import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { OMNITERM_TOKEN, IS_DESKTOP } from '../token';

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

interface Props {
  sessionId: string;
  cwd?: string;
  theme: XtermTheme;
  fontSize: number;
  active: boolean;
  onReady?: (info: { shell: string; cwd: string; pid: number | null }) => void;
  onExit?: (code: number) => void;
  onCwdChange?: (cwd: string) => void;
  onError?: (message: string) => void;
}

/**
 * A real terminal: xterm.js wired to a node-pty session on the loopback API.
 * Everything the shell does — Ctrl+C, tab completion, job control, vim, ssh,
 * colours, aliases from ~/.bashrc — works because this is an actual PTY.
 */
export default function TerminalPane({
  sessionId,
  cwd,
  theme,
  fontSize,
  active,
  onReady,
  onExit,
  onCwdChange,
  onError,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'exited' | 'error'>('connecting');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const send = useCallback((payload: unknown) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  // ------------------------------------------------------------- xterm setup
  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      fontFamily:
        '"JetBrains Mono", "MesloLGS NF", "Fira Code", "DejaVu Sans Mono", Menlo, Consolas, monospace',
      fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowTransparency: true,
      macOptionIsMeta: true,
      theme,
      convertEol: false,
      // Let the shell own the alternate screen (vim, top, less all work).
      windowsPty: undefined,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    fitRef.current = fit;
    searchRef.current = search;
    termRef.current = term;
    if (!IS_DESKTOP) {
      // Debug aid for headless UI checks (never active in the desktop shell).
      const w = window as any;
      w.__otPanes = w.__otPanes || [];
      w.__otPanes.push({ sessionId, term });
    }
    try {
      fit.fit();
    } catch {
      /* container not laid out yet */
    }

    // ---------------------------------------------------------- websocket
    const url = `ws://127.0.0.1:${window.location.port || '80'}/term?token=${encodeURIComponent(OMNITERM_TOKEN)}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: 'start', sessionId, cwd, cols: term.cols, rows: term.rows })
      );
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'data') {
        try {
          term.write(msg.data);
          if (!IS_DESKTOP) {
            const w = window as any;
            w.__otWrites = w.__otWrites || { bytes: 0, last: '' };
            w.__otWrites.bytes += String(msg.data).length;
            w.__otWrites.last = String(msg.data).slice(-40);
          }
        } catch (err: any) {
          (window as any).__otWriteErr = String(err && err.message ? err.message : err);
        }
      } else if (msg.type === 'ready') {
        setStatus('ready');
        onReady?.({ shell: msg.shell, cwd: msg.cwd, pid: msg.pid });
        term.focus();
      } else if (msg.type === 'exit') {
        setStatus('exited');
        term.write(`\r\n\x1b[33m[process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
        onExit?.(msg.exitCode);
      } else if (msg.type === 'error') {
        setStatus('error');
        term.write(`\r\n\x1b[31m[OmniTerm] ${msg.message}\x1b[0m\r\n`);
        onError?.(msg.message);
      }
    };

    ws.onerror = () => {
      setStatus('error');
      onError?.('terminal socket error');
    };

    ws.onclose = () => {
      setStatus((s) => (s === 'ready' ? 'exited' : s));
    };

    // ------------------------------------------------------------- data flow
    const dataSub = term.onData((data) => {
      send({ type: 'input', data });
    });

    const resizeSub = term.onResize(({ cols, rows }) => {
      send({ type: 'resize', cols, rows });
    });

    // ----------------------------------------------------- clipboard & keys
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.shiftKey && (event.key === 'C' || event.key === 'c')) {
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection).catch(() => undefined);
        return false;
      }
      if (ctrl && event.shiftKey && (event.key === 'V' || event.key === 'v')) {
        navigator.clipboard
          .readText()
          .then((text) => text && send({ type: 'input', data: text }))
          .catch(() => undefined);
        return false;
      }
      if (ctrl && event.shiftKey && (event.key === 'F' || event.key === 'f')) {
        setSearchOpen(true);
        return false;
      }
      return true;
    });

    const host = hostRef.current;
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        navigator.clipboard
          .readText()
          .then((text) => text && send({ type: 'input', data: text }))
          .catch(() => undefined);
      }
    };
    host.addEventListener('auxclick', onAuxClick);

    // --------------------------------------------------------- size tracking
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    observer.observe(host);
    const onWindowResize = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      host.removeEventListener('auxclick', onAuxClick);
      dataSub.dispose();
      resizeSub.dispose();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      term.dispose();
      termRef.current = null;
    };
    // The terminal is created once per session; theme/size changes are applied
    // below without tearing the PTY down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // live theme + font updates (no reconnect, no lost scrollback)
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = theme;
  }, [theme]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  useEffect(() => {
    if (active) {
      termRef.current?.focus();
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  const runSearch = (direction: 'next' | 'prev') => {
    if (!query) return;
    if (direction === 'next') searchRef.current?.findNext(query);
    else searchRef.current?.findPrevious(query);
  };

  return (
    <div className="relative w-full h-full bg-[#0A0A0B]">
      <div ref={hostRef} className="absolute inset-0 px-2 py-1" />

      {searchOpen && (
        <div className="absolute top-2 right-3 z-20 flex items-center gap-1 bg-[#161618] border border-[#3A3A40] rounded px-2 py-1 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              searchRef.current?.findNext(e.target.value, { incremental: true });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next');
              if (e.key === 'Escape') setSearchOpen(false);
            }}
            placeholder="search scrollback"
            className="bg-transparent text-xs text-zinc-200 outline-none w-44 placeholder-zinc-600"
          />
          <span className="text-[10px] text-zinc-500">Enter / Shift+Enter · Esc</span>
          <button
            onClick={() => setSearchOpen(false)}
            className="text-zinc-500 hover:text-zinc-200 text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute bottom-2 left-3 z-20 text-[11px] text-red-400 bg-[#1a1012] border border-red-900/60 rounded px-2 py-1">
          terminal backend unavailable — run <code>omniterm --doctor</code>
        </div>
      )}
    </div>
  );
}
