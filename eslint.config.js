import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'docs/**',
      'build/**',
      'backups/**',
      'coverage/**',
    ],
  },

  js.configs.recommended,
  // `recommendedTypeChecked` was evaluated and rejected: against this codebase it
  // reports ~1700 `no-unsafe-*` errors rooted in third-party `any` boundaries,
  // which are explicitly out of scope. `recommended` is the rule set we enforce;
  // the two type-aware promise rules that matter are opted back in below.
  ...tseslint.configs.recommended,

  // Plain JS (Electron main/preload, helper scripts, this config) is CommonJS
  // and carries no type information.
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.commonjs },
    },
    rules: {
      // electron-main.cjs / the socket tests alias Node built-ins (`crypto`,
      // `WebSocket`) as locals on purpose; that shadowing is not a bug.
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },

  // Terminal escape-sequence parsing legitimately matches the control bytes
  // \x1b (ESC) and \x07 (BEL) — no-control-regex would flag every OSC parser.
  {
    files: ['pty.ts', 'scripts/pty-socket-test.cjs'],
    rules: {
      'no-control-regex': 'off',
    },
  },

  // TypeScript sources across the whole project (bundler + tsc both see them).
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Deliberate application logging: console is allowed everywhere.
      'no-console': 'off',
      // `any` shows up in third-party boundaries; surface it, don't block on it.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Type-aware: these need parserOptions.projectService (set above).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-debugger': 'error',
      'no-var': 'error',
    },
  },

  // React UI (renderer process).
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Node-side modules (server, PTY, AI provider, tests, build config).
  {
    files: [
      'server.ts',
      'pty.ts',
      'ai-provider.ts',
      'tests/**/*.ts',
      'vite.config.ts',
      'vitest.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Electron main/preload and helper scripts are CommonJS.
  {
    files: ['electron-main.cjs', 'preload.cjs', 'scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.commonjs },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
