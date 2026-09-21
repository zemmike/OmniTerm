/** @vitest-environment jsdom */

import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AiReader from '../src/components/AiReader';

const readerStyles = readFileSync('src/index.css', 'utf8');

describe('AI Reader', () => {
  let writeText: ReturnType<typeof vi.fn>;
  let stylesheet: HTMLStyleElement;

  beforeEach(() => {
    writeText = vi.fn(async () => undefined);
    stylesheet = document.createElement('style');
    stylesheet.textContent = readerStyles;
    document.head.append(stylesheet);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    cleanup();
    stylesheet.remove();
    vi.restoreAllMocks();
  });

  it('renders semantic headings and safe inline and display TeX', () => {
    render(
      <AiReader
        text={'## Result\n\n$e^{i\\pi}+1=0$\n\n$$x^2$$\n\n<script>alert(1)</script>'}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Result' })).toBeTruthy();
    expect(document.querySelector('.katex')).not.toBeNull();
    expect(document.querySelector('.katex-display')).not.toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
  });

  it('keeps malformed TeX source visible', () => {
    render(<AiReader text={'Malformed: $\\frac{$'} onClose={() => {}} />);

    expect(screen.getByText('\\frac{')).toBeTruthy();
  });

  it('groups ordered and unordered items into semantic lists', () => {
    render(<AiReader text={'3. third\n4. fourth\n\n- alpha\n- beta'} onClose={() => {}} />);

    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(lists[0].tagName).toBe('OL');
    expect(lists[0].getAttribute('start')).toBe('3');
    expect(within(lists[0]).getAllByRole('listitem')).toHaveLength(2);
    expect(lists[1].tagName).toBe('UL');
    expect(within(lists[1]).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders tables inside a stable horizontal scroll container', () => {
    render(
      <AiReader text={'| Name | Value |\n| --- | --- |\n| alpha | $x^2$ |'} onClose={() => {}} />,
    );

    const container = document.querySelector('.reader-table');
    expect(container).not.toBeNull();
    expect(container?.querySelector('table')).toBe(screen.getByRole('table'));
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('alpha')).toBeTruthy();
  });

  it('contains long inline math inside a narrow reader', () => {
    render(
      <div style={{ width: '240px' }}>
        <AiReader
          text={
            'A long formula: $\\displaystyle \\sum_{n=1}^{100000} \\frac{n^2 + n + 1}{n^3 + 2n^2 + 3n + 4}$'
          }
          onClose={() => {}}
        />
      </div>,
    );

    const inlineMath = document.querySelector<HTMLElement>('.reader-math-inline');
    expect(inlineMath).not.toBeNull();
    expect(getComputedStyle(inlineMath!).maxWidth).toBe('100%');
    expect(getComputedStyle(inlineMath!).overflowX).toBe('auto');
    expect(getComputedStyle(inlineMath!).overflowY).toBe('hidden');
  });

  it('copies the original pane text rather than rendered output', async () => {
    const text = '**bold** and $x^2$';
    render(<AiReader text={text} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy the reader text' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(text));
    expect((await screen.findByRole('status')).textContent).toContain('Copied the pane text.');
  });

  it('preserves reader labels, zoom controls, follow state, and close behavior', () => {
    const onClose = vi.fn();
    render(<AiReader text="plain text" onClose={onClose} />);

    expect(screen.getByRole('complementary', { name: 'AI Reader' })).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Reader content' });
    expect(region.style.fontSize).toBe('14px');

    const follow = screen.getByRole('button', { name: 'Following' });
    expect(follow.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(follow);
    expect(screen.getByRole('button', { name: 'Paused' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Larger reader text' }));
    expect(region.style.fontSize).toBe('16.1px');
    fireEvent.click(screen.getByRole('button', { name: 'Smaller reader text' }));
    expect(region.style.fontSize).toBe('14px');

    fireEvent.click(screen.getByRole('button', { name: 'Close the AI Reader' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps parsed paths clickable through the existing normalization behavior', () => {
    const onOpenPath = vi.fn();
    render(
      <AiReader
        text={'Open C:\\repo\\src\\App.tsx:42.'}
        onOpenPath={onOpenPath}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'C:\\repo\\src\\App.tsx:42' }));
    expect(onOpenPath).toHaveBeenCalledWith('C:\\repo\\src\\App.tsx:42');
  });
});
