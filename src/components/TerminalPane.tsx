import React, { useCallback, useEffect, useRef, useState } from 'react';
import PasteConfirmDialog from './PasteConfirmDialog';
import { assessCommand, type RiskAssessment } from '../risk';
import { Terminal, IDisposable, IMarker } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { OMNITERM_TOKEN, IS_DESKTOP } from '../token';
import { terminalTheme, XtermTheme } from '../themes';
import { TerminalSettings } from '../settings';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

export type { XtermTheme };

/** Open a URL through the desktop shell (validated there); fall back to a tab. */
function openExternal(url: string) {
  const bridge = (window as any).omniterm;
  if (IS_DESKTOP && typeof bridge?.openExternal === 'function') {
    bridge.openExternal(url);
    return;
  }
  if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
}

export interface PaneApi {
  copy(): void;
  paste(): Promise<void>;
  selectAll(): void;
  clear(): void;
  focus(): void;
  search(query: string, direction: 'next' | 'prev'): void;
  openSearch(): void;
  scrollToPrompt(direction: -1 | 1): void;
  send(text: string): void;
  /** Handles an app-level action coming from a shortcut. */
  runAction(actionId: string): boolean;
}

interface Props {
  sessionId: string;
  cwd?: string;
  active: boolean;
  settings: TerminalSettings;
  onReady?: (info: {
    shell: string;
    pid: number | null;
    cwd: string;
    integration?: string;
  }) => void;
  onExit?: (code: number) => void;
  onCwdChange?: (cwd: string) => void;
  onFocusPane?: () => void;
  onAction?: (actionId: string, paneId: string) => void;
  registerApi?: (id: string, api: PaneApi | null) => void;
}

export default function TerminalPane({
  sessionId,
  cwd,
  active,
  settings,
  onReady,
  onExit,
  onCwdChange,
  onFocusPane,
  onAction,
  registerApi,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'reconnecting' | 'exited' | 'error'>(
    'connecting',
  );
  const intentionalExit = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuReturnRef = useRef<HTMLElement | null>(null);

  // Live settings via refs so handlers always see the current values without
  // re-creating the terminal.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // The line currently being typed, so Up/Down can filter history by prefix.
  const lineRef = useRef('');
  const historyRef = useRef<string[] | null>(null);
  const historyIndexRef = useRef(-1);
  const pendingHistory = useRef<{ requestId: string; prefix: string } | null>(null);
  const markersRef = useRef<IMarker[]>([]);
  const decorations = useRef<IDisposable[]>([]);
  const apiRef = useRef<PaneApi | null>(null);

  // A paste that is multi-line or matches a risk pattern waits here for the user
  // to read it. Nothing reaches the shell until they confirm.
  const [pastePrompt, setPastePrompt] = useState<{
    text: string;
    assessment: RiskAssessment;
  } | null>(null);

  /**
   * Single decision point for every paste route (Ctrl+V inside xterm, middle
   * click, the context menu, Ctrl+Shift+V): low-risk single-line text goes
   * straight through, anything else is held for review.
   */
  const decidePaste = useCallback((text: string, term: Terminal) => {
    const assessment = assessCommand(text);
    if (assessment.multiline || assessment.level !== 'low') {
      setPastePrompt({ text, assessment });
      return;
    }
    term.paste(text);
  }, []);

  const requestPaste = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) decidePaste(text, term);
    } catch {
      /* clipboard permission denied — nothing to do */
    }
  }, [decidePaste]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const s = settingsRef.current;
    const term = new Terminal({
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      cursorStyle: s.cursorStyle,
      cursorBlink: s.cursorBlink,
      scrollback: s.scrollback,
      theme: terminalTheme(s),
      allowTransparency: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: false,
      convertEol: false,
      windowsPty: undefined,
      // Markers and decorations (command status labels, prompt jumping) are
      // gated behind this flag in xterm.js.
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    // Links: only http(s) reaches the OS, and only on Ctrl/Cmd+click or an
    // explicit click on an underlined link.
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        event.preventDefault();
        openExternal(uri);
      }),
    );

    host.innerHTML = '';
    term.open(host);
    try {
      fit.fit();
    } catch {
      /* container not laid out yet — the ResizeObserver below will retry */
    }
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    // ------------------------------------------------------------- transport
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${location.port}/term?token=${encodeURIComponent(OMNITERM_TOKEN)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    const send = (msg: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.onopen = () => send({ type: 'start', sessionId, cwd, cols: term.cols, rows: term.rows });

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'data') {
        term.write(msg.data);
      } else if (msg.type === 'ready') {
        setStatus('live');
        onReady?.({
          shell: msg.shell,
          pid: msg.pid ?? null,
          cwd: msg.cwd,
          integration: msg.integration,
        });
      } else if (msg.type === 'exit') {
        intentionalExit.current = true;
        setStatus('exited');
        onExit?.(msg.exitCode);
      } else if (msg.type === 'cwd') {
        onCwdChange?.(msg.cwd);
      } else if (msg.type === 'history-result') {
        if (pendingHistory.current && pendingHistory.current.requestId === msg.requestId) {
          historyRef.current = Array.isArray(msg.items) ? msg.items : [];
          pendingHistory.current = null;
          applyHistory(1);
        }
      } else if (msg.type === 'command') {
        if (msg.cwd) onCwdChange?.(msg.cwd);
        decorateCommand(msg);
      } else if (msg.type === 'error') {
        setError(msg.message);
        setStatus('error');
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setError(`cannot reach the terminal service on ${location.host}`);
    };

    ws.onclose = () => {
      if (!termRef.current) return;
      // The backend keeps a session alive after a socket closes (tab switches,
      // remounts), so treat it as a reconnect, not a dead shell.
      setStatus((prev) => (prev === 'live' ? 'reconnecting' : prev));
    };

    // ------------------------------------------------------------ decorations
    function decorateCommand(msg: {
      exitCode: number | null;
      durationMs?: number | null;
      command?: string;
    }) {
      try {
        decorateCommandInner(msg);
      } catch {
        /* decorations are a nicety: never let them break the terminal */
      }
    }

    function decorateCommandInner(msg: {
      exitCode: number | null;
      durationMs?: number | null;
      command?: string;
    }) {
      if (
        typeof term.registerMarker !== 'function' ||
        typeof term.registerDecoration !== 'function'
      )
        return;
      const marker = term.registerMarker(0);
      if (!marker) return;
      const ok = msg.exitCode === 0;
      const bits: string[] = [];
      if (msg.exitCode !== null && msg.exitCode !== undefined) bits.push(`exit ${msg.exitCode}`);
      if (msg.durationMs != null)
        bits.push(
          `${msg.durationMs >= 1000 ? `${(msg.durationMs / 1000).toFixed(1)}s` : `${msg.durationMs}ms`}`,
        );
      const label = bits.join(' · ');
      markersRef.current.push(marker);
      if (markersRef.current.length > 200) {
        const dropped = markersRef.current.shift();
        try {
          dropped?.dispose();
        } catch {
          /* already gone */
        }
      }

      if (!settingsRef.current.commandDecorations || !label) return;
      const width = Math.min(22, term.cols);
      const dec = term.registerDecoration({
        marker,
        width,
        x: Math.max(0, term.cols - width),
        layer: 'top',
        backgroundColor: ok ? 'rgba(34,197,94,0.14)' : 'rgba(248,113,113,0.16)',
        overviewRulerOptions: { color: ok ? '#22C55E' : '#F87171', position: 'right' },
      });
      dec?.onRender((el) => {
        el.textContent = ok && msg.exitCode === 0 ? label : `✗ ${label}`;
        // The renderer anchors the element at its column and ignores `x`, so the
        // position is forced here: full-row width, text against the right edge.
        el.style.cssText =
          `position:absolute;left:0;right:0;width:100%;text-align:right;padding-right:10px;` +
          `color:${ok ? '#22C55E' : '#F87171'};opacity:0.9;font-size:11px;pointer-events:none;`;
      });
      if (dec) decorations.current.push(dec);
      if (decorations.current.length > 100) decorations.current.shift()?.dispose();
    }

    // ------------------------------------------------------------- input side
    const dataSub = term.onData((data) => {
      // Bracketed paste (xterm wraps pastes in \x1b[200~ … \x1b[201~ when the
      // shell enables it, which bash and zsh do by default). This is the choke
      // point every paste passes through, so the review gate lives here: a
      // multi-line or risky paste is held, and not a byte of it reaches the shell.
      const pasted = bracketedPasteContent(data);
      if (pasted !== null) {
        const assessment = assessCommand(pasted);
        if (assessment.multiline || assessment.level !== 'low') {
          setPastePrompt({ text: pasted, assessment });
          return;
        }
      }

      // Track the line under the cursor so Up/Down can use it as a prefix.
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          lineRef.current = '';
          historyRef.current = null;
          historyIndexRef.current = -1;
        } else if (ch === '\u007f' || ch === '\b') {
          lineRef.current = lineRef.current.slice(0, -1);
        } else if (ch === '\u0003' || ch === '\u0015' || ch === '\u000c') {
          lineRef.current = '';
        } else if (ch >= ' ') {
          lineRef.current += ch;
        }
      }
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
    });

    function applyHistory(direction: -1 | 1) {
      const items = historyRef.current;
      if (!items || items.length === 0) return false;
      let idx = historyIndexRef.current + (direction === -1 ? 1 : -1);
      if (idx < 0) idx = 0;
      if (idx > items.length - 1) {
        // Past the newest match: clear the line back to the original prefix.
        historyIndexRef.current = -1;
        term.write('');
        send({ type: 'input', data: '\u0015' });
        lineRef.current = '';
        return true;
      }
      historyIndexRef.current = idx;
      const entry = items[idx];
      // Ctrl+U kills the current line, then the entry is typed in its place.
      send({ type: 'input', data: `\u0015${entry}` });
      lineRef.current = entry;
      return true;
    }

    function requestHistory(prefix: string) {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      pendingHistory.current = { requestId, prefix };
      historyIndexRef.current = -1;
      send({ type: 'history', prefix, limit: 400, requestId });
    }

    // Prefix-filtered history: typing `git` then Up cycles only git commands.
    // Note: attachCustomKeyEventHandler returns void (it replaces the handler),
    // so there is nothing to dispose here.
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== 'keydown') return true;
      const s2 = settingsRef.current;

      // App-level shortcuts are handled by the parent (TerminalView).
      if (
        (event.ctrlKey && event.shiftKey) ||
        (event.ctrlKey && !event.shiftKey && ['PageUp', 'PageDown', 'Tab'].includes(event.key))
      ) {
        // let the parent's window listener deal with it
        return true;
      }

      if (
        s2.prefixHistory &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        const prefix = lineRef.current.trim();
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const direction: -1 | 1 = event.key === 'ArrowUp' ? -1 : 1;
          const haveFresh = historyRef.current && historyRef.current.length > 0;
          if (!prefix && !haveFresh) return true; // plain shell history
          if (!haveFresh) {
            requestHistory(prefix);
          } else {
            applyHistory(direction);
          }
          event.preventDefault();
          return false;
        }
        if (historyRef.current) {
          historyRef.current = null;
          historyIndexRef.current = -1;
        }
      }
      return true;
    });

    // ---------------------------------------------------------- mouse & focus
    const onMouseDown = (event: MouseEvent) => {
      onFocusPane?.();
      setMenu(null);
      if (event.button === 0) {
        // Clicking the terminal should always give it the keyboard.
        term.focus();
      }
    };
    const onAuxClick = (event: MouseEvent) => {
      // Middle click pastes, like an X11 terminal.
      if (event.button === 1 && settingsRef.current.middleClickPaste) {
        event.preventDefault();
        void requestPaste();
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!settingsRef.current.contextMenu) return;
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    host.addEventListener('mousedown', onMouseDown);
    host.addEventListener('auxclick', onAuxClick);
    host.addEventListener('contextmenu', onContextMenu);

    // Copy on select, if enabled.
    const selSub = term.onSelectionChange(() => {
      const text = term.getSelection();
      if (settingsRef.current.copyOnSelect && text && document.hasFocus()) {
        navigator.clipboard?.writeText(text).catch(() => undefined);
      }
    });

    // Keep PTY and grid in step.
    const resizeSub = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
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
    requestAnimationFrame(() => {
      try {
        fit.fit();
        term.refresh(0, term.rows - 1);
      } catch {
        /* ignore */
      }
    });
    if (typeof (document as any).fonts?.ready?.then === 'function') {
      (document as any).fonts.ready.then(() => {
        try {
          fit.fit();
          term.refresh(0, term.rows - 1);
        } catch {
          /* ignore */
        }
      });
    }

    const api: PaneApi = {
      copy: () => {
        const text = term.getSelection();
        if (text) navigator.clipboard?.writeText(text).catch(() => undefined);
      },
      paste: async () => {
        await requestPaste();
      },
      selectAll: () => term.selectAll(),
      clear: () => term.clear(),
      focus: () => term.focus(),
      search: (query, direction) => {
        if (!query) return;
        if (direction === 'next') search.findNext(query, { incremental: true });
        else search.findPrevious(query, { incremental: true });
      },
      openSearch: () => setSearchOpen(true),
      scrollToPrompt: (direction) => jumpToPrompt(direction),
      send: (text: string) => send({ type: 'input', data: text }),
      runAction: (actionId: string) => {
        switch (actionId) {
          case 'copy':
            api.copy();
            return true;
          case 'paste':
            void api.paste();
            return true;
          case 'selectAll':
            term.selectAll();
            return true;
          case 'clear':
            term.clear();
            return true;
          case 'search':
            setSearchOpen(true);
            return true;
          case 'prevPrompt':
            jumpToPrompt(-1);
            return true;
          case 'nextPrompt':
            jumpToPrompt(1);
            return true;
          default:
            return false;
        }
      },
    };
    apiRef.current = api;
    registerApi?.(sessionId, api);

    function jumpToPrompt(direction: -1 | 1) {
      markersRef.current = markersRef.current.filter((m) => !m.isDisposed);
      if (markersRef.current.length === 0) return;
      const top = term.buffer.active.viewportY;
      const lines = markersRef.current.map((m) => m.line).sort((a, b) => a - b);
      const target =
        direction === -1
          ? [...lines].reverse().find((l) => l < top - 1)
          : lines.find((l) => l > top + 1);
      if (target !== undefined) term.scrollToLine(Math.max(0, target - 1));
    }

    return () => {
      registerApi?.(sessionId, null);
      apiRef.current = null;
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      host.removeEventListener('mousedown', onMouseDown);
      host.removeEventListener('auxclick', onAuxClick);
      host.removeEventListener('contextmenu', onContextMenu);
      dataSub.dispose();
      selSub.dispose();
      resizeSub.dispose();
      decorations.current.forEach((d) => {
        try {
          d.dispose();
        } catch {
          /* ignore */
        }
      });
      markersRef.current.forEach((m) => {
        try {
          m.dispose();
        } catch {
          /* ignore */
        }
      });
      decorations.current = [];
      markersRef.current = [];
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      term.dispose();
      termRef.current = null;
    };
    // Reconnect only when the session or its cwd changes: live settings are read
    // through settingsRef, and re-running this effect would tear down and
    // respawn the running PTY, so the callbacks (onReady, onExit, onCwdChange,
    // onFocusPane, registerApi) it closes over are deliberately not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, cwd, requestPaste]);

  // Live option updates: theme, font and cursor change without a reconnect.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = terminalTheme(settings);
    term.options.fontFamily = settings.fontFamily;
    term.options.fontSize = settings.fontSize;
    term.options.lineHeight = settings.lineHeight;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    term.options.scrollback = settings.scrollback;
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => {
    if (active) termRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // The context menu behaves like a real menu: focus moves to the first item
  // when it opens, Escape closes it, and focus goes back to the terminal after.
  useEffect(() => {
    if (!menu) return;
    menuReturnRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus();

    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenu(null);
      }
    };
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey, true);
      const returnTo = menuReturnRef.current;
      if (returnTo && returnTo.isConnected) returnTo.focus();
    };
  }, [menu]);

  const copy = useCallback(() => apiRef.current?.copy(), []);
  const paste = useCallback(() => apiRef.current?.paste(), []);
  const selectAll = useCallback(() => apiRef.current?.selectAll(), []);
  const clearScreen = useCallback(() => apiRef.current?.clear(), []);

  return (
    <div
      className="relative w-full h-full"
      style={{ background: terminalTheme(settings).background }}
    >
      <div
        ref={hostRef}
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        className="absolute inset-0 px-2 py-1"
        onMouseDown={() => onFocusPane?.()}
        style={{ cursor: 'text' }}
      />

      {status !== 'live' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-2 bottom-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-[#EAB308] pointer-events-none"
        >
          {status === 'connecting' && 'starting shell…'}
          {status === 'reconnecting' && 'reconnecting…'}
          {status === 'error' && `error: ${error}`}
          {status === 'exited' && 'shell exited — close this pane or open a new tab'}
        </div>
      )}

      {searchOpen && (
        <div
          role="search"
          aria-label="Search terminal scrollback"
          className="absolute top-1 right-2 z-20 flex items-center gap-1 bg-[#161618] border border-[#2A2A2E] rounded px-2 py-1 shadow-lg"
        >
          <Search aria-hidden="true" className="w-3.5 h-3.5 text-[#88888E]" />
          <input
            autoFocus
            aria-label="Search scrollback"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchRef.current?.findNext(e.target.value, { incremental: true });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) {
                  searchRef.current?.findPrevious(searchQuery);
                } else {
                  searchRef.current?.findNext(searchQuery);
                }
              }
            }}
            placeholder="search scrollback"
            className="bg-transparent outline-none text-[11px] text-[#E0E0E5] w-40 font-mono focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#00FF41]"
          />
          <button
            title="Previous"
            aria-label="Previous match"
            onClick={() => searchRef.current?.findPrevious(searchQuery)}
            className="text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
          >
            <ChevronUp aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
          <button
            title="Next"
            aria-label="Next match"
            onClick={() => searchRef.current?.findNext(searchQuery)}
            className="text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
          >
            <ChevronDown aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
          <button
            title="Close"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
            className="text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF41]"
          >
            <X aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Terminal actions"
          className="absolute z-30 min-w-[170px] bg-[#161618] border border-[#2A2A2E] rounded shadow-2xl py-1 text-[11px] text-[#E0E0E5]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: 'Copy', hint: 'Ctrl+Shift+C', run: copy, disabled: false },
            { label: 'Paste', hint: 'Ctrl+Shift+V', run: paste, disabled: false },
            { label: 'Select all', hint: 'Ctrl+Shift+A', run: selectAll, disabled: false },
            {
              label: 'Search…',
              hint: 'Ctrl+Shift+F',
              run: () => setSearchOpen(true),
              disabled: false,
            },
            { label: 'Clear screen', hint: 'Ctrl+Shift+K', run: clearScreen, disabled: false },
          ].map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.run();
                setMenu(null);
              }}
              className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-[#202024] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00FF41]"
            >
              <span>{item.label}</span>
              <span className="text-[10px] text-[#55555E]" aria-hidden="true">
                {item.hint}
              </span>
            </button>
          ))}
          <div className="h-px bg-[#2A2A2E] my-1" role="separator" />
          <button
            role="menuitem"
            onClick={() => {
              onAction?.('splitRight', sessionId);
              setMenu(null);
            }}
            className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00FF41]"
          >
            <span>Split right</span>
            <span className="text-[10px] text-[#55555E]" aria-hidden="true">
              Ctrl+Shift+E
            </span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onAction?.('splitDown', sessionId);
              setMenu(null);
            }}
            className="w-full flex items-center justify-between gap-6 px-3 py-1.5 hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00FF41]"
          >
            <span>Split down</span>
            <span className="text-[10px] text-[#55555E]" aria-hidden="true">
              Ctrl+Shift+O
            </span>
          </button>
        </div>
      )}
      {pastePrompt && (
        <PasteConfirmDialog
          text={pastePrompt.text}
          assessment={pastePrompt.assessment}
          onCancel={() => setPastePrompt(null)}
          onConfirm={() => {
            termRef.current?.paste(pastePrompt.text);
            setPastePrompt(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Returns the text of a bracketed paste, or null when the data is ordinary
 * keystrokes. The markers are what xterm.js emits when a shell has bracketed
 * paste enabled (bash and zsh do by default); without them we cannot tell a paste
 * from typing, which is why the explicit paste routes also go through the gate.
 */
function bracketedPasteContent(data: string): string | null {
  const START = '\x1b[200~';
  const END = '\x1b[201~';
  if (!data.startsWith(START)) return null;
  const body = data.endsWith(END)
    ? data.slice(START.length, -END.length)
    : data.slice(START.length);
  return body;
}
