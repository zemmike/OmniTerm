import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Copy, X, ZoomIn, ZoomOut } from 'lucide-react';
import { looksLikePath, parseReaderText, type ReaderBlock } from '../readerMarkdown';
import { normalizeTargetPath } from '../fileTarget';

interface Props {
  /** Raw terminal output, straight from the pane's rendered buffer. */
  text: string;
  /** Open a file path in the Files tab. */
  onOpenPath?: (path: string) => void;
  onClose: () => void;
}

const SCALES = [0.85, 1, 1.15, 1.3, 1.5];

/**
 * A reader panel for terminal output that was written for a fixed-width screen.
 *
 * The terminal itself is untouched: this observes the pane's rendered buffer and
 * presents the same bytes with real typography. Nothing here writes to the PTY, so a
 * full-screen agent cannot be disturbed by the panel being open — which is the whole
 * reason it is a side panel rather than a smarter terminal.
 */
export default function AiReader({ text, onOpenPath, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const blocks = useMemo(() => parseReaderText(text), [text]);

  // Follow the newest output, unless the user has scrolled up to read something.
  useEffect(() => {
    if (!follow) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [blocks, follow]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Escape belongs to the shell while the terminal (or any input) has focus: vim,
      // less and ssh all need it. Only close when the reader is what is focused.
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea, input, select, [contenteditable="true"], .xterm')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
    setFollow(atBottom);
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied: the terminal's own copy still works */
    }
  };

  const step = (direction: 1 | -1) => {
    const index = Math.max(0, SCALES.indexOf(scale));
    const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, index + direction))];
    setScale(next);
  };

  return (
    <aside
      aria-label="AI Reader"
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[46rem] flex-col border-l border-[#2A2A2E] bg-[#0D0D0F] shadow-[-8px_0_24px_rgba(0,0,0,0.45)] sm:w-[42%]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#1E1E22] px-2 py-1">
        <BookOpen aria-hidden="true" className="h-3.5 w-3.5 text-[#8AB4F8]" />
        <span className="text-[11px] font-bold text-[#E0E0E5]">AI Reader</span>
        <span className="text-[10px] text-[#66666E]">formatted from this pane</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setFollow((current) => !current)}
          aria-pressed={follow}
          title="Follow the newest output"
          className={`rounded border px-1.5 py-0.5 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)] ${
            follow
              ? 'border-[#8AB4F8] text-[#8AB4F8]'
              : 'border-[#2A2A2E] text-[#88888E] hover:text-[#E0E0E5]'
          }`}
        >
          {follow ? 'Following' : 'Paused'}
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Smaller reader text"
          className="rounded p-0.5 text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          <ZoomOut aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Larger reader text"
          className="rounded p-0.5 text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          <ZoomIn aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void copyAll()}
          aria-label="Copy the reader text"
          className="rounded p-0.5 text-[#88888E] hover:text-[#E0E0E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the AI Reader"
          className="rounded p-0.5 text-[#88888E] hover:text-[#FF5555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={bodyRef}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label="Reader content"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--ui-accent)]"
        style={{ fontSize: `${13 * scale}px`, lineHeight: 1.65 }}
      >
        {blocks.length === 0 ? (
          <p className="text-[#66666E]">
            Nothing to read yet. This shows the focused pane&apos;s output as it arrives.
          </p>
        ) : (
          blocks.map((block, index) => (
            <ReaderBlockView key={index} block={block} scale={scale} onOpenPath={onOpenPath} />
          ))
        )}
        {copied && (
          <p role="status" className="pt-2 text-[11px] text-[#00C853]">
            Copied the pane text.
          </p>
        )}
      </div>
    </aside>
  );
}

function ReaderBlockView({
  block,
  scale,
  onOpenPath,
  key: _key,
}: {
  block: ReaderBlock;
  scale: number;
  onOpenPath?: (path: string) => void;
  // React 19 passes `key` through as a normal prop, so it has to be accepted here.
  // It is destructured (and ignored) purely so it is not spread onto the DOM node.
  key?: React.Key;
}) {
  switch (block.kind) {
    case 'heading': {
      const size = block.level <= 1 ? 1.35 : block.level === 2 ? 1.2 : 1.08;
      const Tag = (block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4') as
        'h2' | 'h3' | 'h4';
      return (
        <Tag
          className="mt-4 mb-1.5 font-bold text-[#F2F2F5] first:mt-0"
          style={{ fontSize: `${size}em` }}
        >
          {block.text}
        </Tag>
      );
    }
    case 'bullet':
      return (
        <div className="flex gap-2 py-0.5">
          <span aria-hidden="true" className="shrink-0 text-[#8AB4F8]">
            {block.marker === '-' || block.marker === '*' || block.marker === '•'
              ? '•'
              : block.marker}
          </span>
          <span className="text-[#DCDCE2]">
            <InlineText text={block.text} onOpenPath={onOpenPath} />
          </span>
        </div>
      );
    case 'quote':
      return (
        <blockquote className="my-2 border-l-2 border-[#3A3A42] pl-3 text-[#A9A9B2]">
          <InlineText text={block.text} onOpenPath={onOpenPath} />
        </blockquote>
      );
    case 'code':
      return (
        <pre className="my-2 overflow-x-auto rounded border border-[#232329] bg-[#111114] p-2.5">
          <code
            className="whitespace-pre text-[#D7E1C9]"
            style={{ fontSize: `${Math.max(10, 12 * scale)}px`, lineHeight: 1.5 }}
          >
            {block.text}
          </code>
        </pre>
      );
    default:
      return (
        <p className="my-1.5 whitespace-pre-wrap text-[#DCDCE2]">
          <InlineText text={block.text} onOpenPath={onOpenPath} />
        </p>
      );
  }
}

/** Inline `code` and clickable paths, without ever injecting HTML. */
function InlineText({ text, onOpenPath }: { text: string; onOpenPath?: (path: string) => void }) {
  const parts = useMemo(() => {
    const out: Array<{ kind: 'text' | 'code' | 'path'; value: string }> = [];
    const pattern = /(`[^`]+`)|([\w./+-]*\/[\w./+-]*|\b[\w.-]+\.[a-z]{1,5}\b)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) out.push({ kind: 'text', value: text.slice(last, match.index) });
      const token = match[0];
      if (token.startsWith('`')) out.push({ kind: 'code', value: token.slice(1, -1) });
      else if (looksLikePath(token)) out.push({ kind: 'path', value: token });
      else out.push({ kind: 'text', value: token });
      last = match.index + token.length;
    }
    if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
    return out;
  }, [text]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'code') {
          return (
            <code key={index} className="rounded bg-[#1B1B20] px-1 py-0.5 text-[#E7D6A8]">
              {part.value}
            </code>
          );
        }
        if (part.kind === 'path' && onOpenPath) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => onOpenPath(normalizeTargetPath(part.value))}
              title={`Open ${part.value} in the Files tab`}
              className="rounded text-left text-[#8AB4F8] underline decoration-dotted underline-offset-2 hover:text-[#AECBFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
            >
              {part.value}
            </button>
          );
        }
        return <React.Fragment key={index}>{part.value}</React.Fragment>;
      })}
    </>
  );
}
