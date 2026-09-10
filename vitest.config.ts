import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/helpers/global-setup.ts'],
    // One server per test file is booted in beforeAll; keep files serial so a
    // stray legacy server can never collide on a port.
    fileParallelism: false,
  },
});
