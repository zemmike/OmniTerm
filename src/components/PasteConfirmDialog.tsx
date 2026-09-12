import React, { useEffect, useId, useRef } from 'react';
import type { RiskAssessment } from '../risk';
import { RISK_LABEL, riskHeadline } from '../risk';

interface Props {
  text: string;
  assessment: RiskAssessment;
  /** Called when the user decides to send it to the shell. */
  onConfirm: () => void;
  /** Called when the user backs out. Nothing is sent. */
  onCancel: () => void;
}

const LEVEL_ACCENT: Record<RiskAssessment['level'], string> = {
  low: '#4ADE80',
  caution: '#FBBF24',
  high: '#FB923C',
  critical: '#FF5555',
};

/**
 * Shown before a paste reaches the shell when the text is multi-line or matches a
 * known risk pattern. Nothing is executed here — the user reads the exact text,
 * sees why it was flagged, and either sends it or cancels. The copy deliberately
 * avoids the word "safe": it states which patterns were checked and what was
 * found, which is all this can honestly claim.
 */
export default function PasteConfirmDialog({ text, assessment, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the safe option first: a stray Enter should cancel, not run.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const accent = LEVEL_ACCENT[assessment.level];
  const lines = text.split(/\r?\n/).length;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-2xl max-h-full overflow-auto rounded border border-[#2A2A2E] bg-[#141417] p-4 shadow-xl"
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black"
            style={{ backgroundColor: accent }}
          >
            {RISK_LABEL[assessment.level]}
          </span>
          <h2 id={titleId} className="text-[13px] font-semibold text-[#E0E0E5]">
            Review this paste before it runs
          </h2>
        </div>

        <p id={descId} className="mt-2 text-[11px] leading-relaxed text-[#B9B9C2]">
          {riskHeadline(assessment)}
          {assessment.multiline
            ? ` The clipboard holds ${lines} lines, so this would run more than one command.`
            : ''}
        </p>

        {assessment.findings.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {assessment.findings.map((finding) => (
              <li key={`${finding.id}-${finding.match}`} className="text-[11px] text-[#D6D6DC]">
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: LEVEL_ACCENT[finding.level] }}
                  aria-hidden="true"
                />
                {finding.reason}{' '}
                <code className="rounded bg-[#1E1E22] px-1 py-0.5 text-[10px] text-[#FFD8A8]">
                  {finding.match.slice(0, 120)}
                </code>
              </li>
            ))}
          </ul>
        )}

        <pre className="mt-3 max-h-52 overflow-auto rounded border border-[#2A2A2E] bg-[#0F0F10] p-2 text-[11px] leading-relaxed text-[#E0E0E5] whitespace-pre-wrap">
          {text}
        </pre>

        <p className="mt-2 text-[10px] text-[#7A7A85]">
          Checked {assessment.checked.length} known risk patterns. That is not a guarantee — you are
          responsible for what you run.
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[var(--ui-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
          >
            Cancel (Esc)
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-2.5 py-1.5 text-[11px] rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]"
            style={{
              borderColor: accent,
              color: assessment.level === 'critical' ? '#FFD8D8' : undefined,
            }}
          >
            {assessment.level === 'critical'
              ? 'Send it anyway — I read it'
              : 'Paste into the terminal'}
          </button>
        </div>
      </div>
    </div>
  );
}
