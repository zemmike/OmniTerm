/** @vitest-environment jsdom */
/**
 * Regression guard for opening a path from the terminal.
 *
 * The reported failure was not "the file is missing": the Files tab navigated, opened
 * the file, and then showed an *empty list* with no explanation. Two defects produced
 * that, and both are pinned here:
 *
 *   1. The entry was looked up with a strict path comparison, so a file the API reports
 *      under a resolved path (a symlink, a different prefix) was never found.
 *   2. The fallback then filtered the list to the file's name unconditionally. When the
 *      folder does not list that name - hidden files are the everyday case - the filter
 *      matched nothing and the page went blank, silently.
 *
 * These tests stub the local API rather than the network, so they exercise the real
 * component logic: the folder must stay visible, and a genuine failure must say so and
 * offer a way out instead of showing nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FileManagerView } from '../src/components/FileManagerView';
import { installBrowserApiStubs } from './helpers/a11y-env';

installBrowserApiStubs();

const DIR = '/home/michael/project';
const OTHER = `${DIR}/other.txt`;
const HIDDEN = `${DIR}/.env`; // readable, but absent from the folder listing
const MISSING = '/nope/missing.ts';

const entry = (name: string, type: 'file' | 'directory' = 'file') => ({
  id: `${DIR}/${name}`,
  path: `${DIR}/${name}`,
  name,
  type,
  size: 10,
  modified: 'just now',
  owner: 'michael',
  permissions: '-rw-r--r--',
  language: 'text',
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : String((input as Request).url || input);
    const url = new URL(raw, 'http://127.0.0.1');
    const requested = url.searchParams.get('path') || '';

    if (url.pathname === '/api/files') {
      // Only the visible file is listed, exactly as a hidden file would not be.
      if (requested === DIR || requested === OTHER) {
        return json(200, { path: DIR, parent: '/home/michael', entries: [entry('other.txt')] });
      }
      return json(400, { error: `Not a directory: ${requested}` });
    }
    if (url.pathname === '/api/files/read') {
      if (requested === HIDDEN) {
        return json(200, {
          path: HIDDEN,
          content: 'SECRET=1\n',
          size: 9,
          language: 'text',
          readOnly: false,
        });
      }
      return json(400, { error: `Path not found: ${requested}` });
    }
    return json(404, { error: 'Not found' });
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a path the folder listing does not show', () => {
  it('opens the file and keeps the folder visible, instead of blanking the list', async () => {
    render(<FileManagerView openTarget={{ path: HIDDEN, requestId: 1 }} />);

    // The file itself opens: it is readable, so refusing it would be wrong.
    await waitFor(() => expect(screen.getByDisplayValue(/SECRET=1/)).toBeTruthy());

    // And the folder's contents are still on screen. Filtering to ".env" would match
    // nothing here, which is what produced the empty page.
    expect(screen.getByText('other.txt')).toBeTruthy();
  });
});

describe('a path that genuinely cannot be opened', () => {
  it('explains the failure and offers a way out', async () => {
    render(<FileManagerView openTarget={{ path: MISSING, requestId: 2 }} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('missing.ts');
    expect(alert.textContent).toContain(MISSING);
    expect(screen.getByRole('button', { name: /Search everywhere for/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open \/nope/ })).toBeTruthy();
  });
});
