import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Both extensions: the API suites are .ts and the UI/accessibility suite is
    // .tsx (it needs the jsdom environment, which it requests per file).
    include: ['tests/**/*.test.{ts,tsx}'],
    globalSetup: ['./tests/helpers/global-setup.ts'],
    // One server per test file is booted in beforeAll; keep files serial so a
    // stray legacy server can never collide on a port.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}', 'server.ts', 'pty.ts'],
      exclude: ['tests/**', 'dist/**', 'scripts/**', 'coverage/**', '**/*.d.ts'],
    },
  },
});
