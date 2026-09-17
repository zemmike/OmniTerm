import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Copy, X, ZoomIn, ZoomOut } from 'lucide-react';
import katex from 'katex';
import { parseReaderText, type InlineToken, type ReaderBlock } from '../readerMarkdown';
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
        style={{
          fontSize: `${13 * scale}px`,
          lineHeight: 1.7,
          // Sans-serif prose against the terminal's monospace is most of what makes
          // this readable at a glance; code keeps monospace below.
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        }}
      >
        <div className="reader-prose">
          {blocks.length === 0 ? (
            <p className="text-[#66666E]">
              Nothing to read yet. This shows the focused pane&apos;s output as it arrives.
            </p>
          ) : (
            blocks.map((block, index) => (
              <React.Fragment key={index}>
                <ReaderBlockView block={block} scale={scale} onOpenPath={onOpenPath} />
              </React.Fragment>
            ))
          )}
          {copied && (
            <p role="status" className="pt-2 text-[11px] text-[#00C853]">
              Copied the pane text.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function ReaderBlockView({
  block,
  scale,
  onOpenPath,
}: {
  block: ReaderBlock;
  scale: number;
  onOpenPath?: (path: string) => void;
}) {
  switch (block.kind) {
    case 'heading': {
      const size = block.level <= 1 ? 1.35 : block.level === 2 ? 1.2 : 1.08;
      const Tag = `h${Math.min(6, Math.max(1, block.level))}` as
        | 'h1'
        | 'h2'
        | 'h3'
        | 'h4'
        | 'h5'
        | 'h6';
      return (
        <Tag
          className="mt-4 mb-1.5 font-bold text-[#F2F2F5] first:mt-0"
          style={{ fontSize: `${size}em` }}
        >
          <InlineTokens tokens={block.content} onOpenPath={onOpenPath} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="my-1.5 whitespace-pre-wrap text-[#DCDCE2]">
          <InlineTokens tokens={block.content} onOpenPath={onOpenPath} />
        </p>
      );
    case 'quote':
      return (
        <blockquote className="my-2 border-l-2 border-[#3A3A42] pl-3 text-[#A9A9B2]">
          <InlineTokens tokens={block.content} onOpenPath={onOpenPath} />
        </blockquote>
      );
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List
          className={`my-2 space-y-1 pl-6 text-[#DCDCE2] ${block.ordered ? 'list-decimal' : 'list-disc'}`}
          start={block.ordered ? block.start : undefined}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1 marker:text-[#8AB4F8]">
              <InlineTokens tokens={item} onOpenPath={onOpenPath} />
            </li>
          ))}
        </List>
      );
    }
    case 'code':
      return (
        <pre className="reader-code my-2 rounded border border-[#232329] bg-[#111114] p-2.5">
          <code
            className="whitespace-pre text-[#D7E1C9]"
            data-language={block.lang || undefined}
            style={{ fontSize: `${Math.max(10, 12 * scale)}px`, lineHeight: 1.5 }}
          >
            {block.text}
          </code>
        </pre>
      );
    case 'table':
      return (
        <div className="reader-table my-3 rounded border border-[#2A2A2E]">
          <table>
            <thead className="bg-[#17171B] text-left text-[#F2F2F5]">
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index} scope="col">
                    <InlineTokens tokens={header} onOpenPath={onOpenPath} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[#DCDCE2]">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      <InlineTokens tokens={cell} onOpenPath={onOpenPath} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'math':
      return <MathToken value={block.value} displayMode />;
  }
}

function InlineTokens({
  tokens,
  onOpenPath,
}: {
  tokens: InlineToken[];
  onOpenPath?: (path: string) => void;
}) {
  return (
    <>
      {tokens.map((token, index) => (
        <React.Fragment key={index}>
          <InlineTokenView token={token} onOpenPath={onOpenPath} />
        </React.Fragment>
      ))}
    </>
  );
}

function InlineTokenView({
  token,
  onOpenPath,
}: {
  token: InlineToken;
  onOpenPath?: (path: string) => void;
}) {
  switch (token.kind) {
    case 'text':
      return token.value;
    case 'strong':
      return <strong className="font-semibold text-[#F2F2F5]">{token.value}</strong>;
    case 'emphasis':
      return <em>{token.value}</em>;
    case 'code':
      return <code className="rounded bg-[#1B1B20] px-1 py-0.5 text-[#E7D6A8]">{token.value}</code>;
    case 'path':
      if (!onOpenPath) return token.value;
      return (
        <button
          type="button"
          onClick={() => onOpenPath(normalizeTargetPath(token.value))}
          title={`Open ${token.value} in the Files tab`}
          className="rounded text-left text-[#8AB4F8] underline decoration-dotted underline-offset-2 hover:text-[#AECBFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
        >
          {token.value}
        </button>
      );
    case 'math':
      return <MathToken value={token.value} displayMode={false} />;
  }
}

function MathToken({ value, displayMode }: { value: string; displayMode: boolean }) {
  let html: string;
  try {
    html = katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      strict: 'warn',
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return (
      <code className="rounded bg-[#1B1B20] px-1 py-0.5 text-[#E7D6A8]">
        {displayMode ? `$$${value}$$` : `$${value}$`}
      </code>
    );
  }

  const Tag = displayMode ? 'div' : 'span';
  return (
    <Tag
      className={`reader-math ${displayMode ? 'reader-math-display' : 'reader-math-inline'}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
