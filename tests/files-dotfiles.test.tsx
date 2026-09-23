/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FileManagerView } from '../src/components/FileManagerView';
import { installBrowserApiStubs } from './helpers/a11y-env';

installBrowserApiStubs();

const DIR = '/home/me/project';
const entry = (name: string) => ({
  id: `${DIR}/${name}`,
  path: `${DIR}/${name}`,
  name,
  type: 'file',
  size: 10,
  modified: 'just now',
  owner: 'me',
  permissions: '-rw-r--r--',
  language: 'text',
});

beforeEach(() => {
  localStorage.removeItem('omniterm:files:showDotfiles');
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ path: DIR, parent: '/home/me', entries: [entry('.env'), entry('app.ts')] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;
});

afterEach(cleanup);

describe('dotfiles toggle', () => {
  it('hides and shows .name files, and remembers the choice', async () => {
    render(<FileManagerView />);
    await screen.findByText('app.ts');
    expect(screen.getByText('.env')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hide dotfiles' }));
    expect(screen.queryByText('.env')).toBeNull();
    expect(screen.getByText('app.ts')).toBeTruthy();
    expect(localStorage.getItem('omniterm:files:showDotfiles')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Show dotfiles' }));
    expect(screen.getByText('.env')).toBeTruthy();
  });
});
