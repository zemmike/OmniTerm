import React from 'react';
import { Keyboard } from 'lucide-react';
import { ACTIONS, bindingFor, formatBinding, isDefault } from '../keys';

/**
 * The keyboard reference. A terminal is judged on how fast it is to drive, and
 * the binding list was previously only discoverable by opening the shortcut
 * recorder. This reads the same registry, so a re-bound key shows its real
 * binding here rather than the default.
 *
 * Deliberately a <details> block: it is keyboard-operable and screen-reader
 * friendly without a hand-rolled disclosure widget.
 */
export default function ShortcutsCheatsheet() {
  const groups = Array.from(new Set(ACTIONS.map((action) => action.group)));

  return (
    <details className="border border-[#2A2A2E] rounded bg-[#0F0F11]">
      <summary className="cursor-pointer list-none p-3 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]">
        <Keyboard aria-hidden="true" className="w-3.5 h-3.5 text-[#8AB4F8]" />
        <span className="text-[12px] font-semibold text-[#E0E0E5]">Keyboard shortcuts</span>
        <span className="text-[10px] text-[#7A7A85]">
          {ACTIONS.length} actions — click to {''}
          expand
        </span>
      </summary>

      <div className="px-3 pb-3 space-y-3">
        {groups.map((group) => (
          <div key={group}>
            <h3 className="text-[10px] uppercase tracking-wide text-[#7A7A85] mb-1">{group}</h3>
            <ul className="space-y-0.5">
              {ACTIONS.filter((action) => action.group === group).map((action) => {
                const binding = bindingFor(action.id);
                return (
                  <li
                    key={action.id}
                    className="flex items-center justify-between gap-4 text-[11px] text-[#C9C9D1]"
                  >
                    <span>{action.label}</span>
                    <span className="flex items-center gap-1.5">
                      <kbd className="rounded border border-[#2A2A2E] bg-[#1A1A1E] px-1.5 py-0.5 text-[10px] text-[#E0E0E5]">
                        {binding ? formatBinding(binding) : 'unbound'}
                      </kbd>
                      {!isDefault(action.id) && (
                        <span className="text-[9px] text-[#8AB4F8]">changed</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <p className="text-[10px] text-[#7A7A85]">
          Bindings are per machine and are saved in this browser&apos;s local storage. Change them
          in the section above.
        </p>
      </div>
    </details>
  );
}
