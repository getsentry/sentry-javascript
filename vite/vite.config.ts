import { defineConfig } from 'vitest/config';

const REMOVE_CJS_BLOCK = /\/\*! rollup-include-cjs-only \*\/[\s\S]*?\/\*! rollup-include-cjs-only-end \*\/\s*/g;
const STRIP_ESM_MARKERS = /[ \t]*\/\*! rollup-include-esm-only(?:-end)? \*\/[ \t]*\r?\n?/g;

// Mirrors the ESM path of makeEsmCjsReplacePlugin from rollup-utils. Vitest
// transforms TypeScript source to ESM so tests see only the ESM branch.
const esmOnlyPlugin = {
  name: 'vitest-esm-only',
  transform(code: string) {
    if (!code.includes('rollup-include-')) return null;
    return { code: code.replace(REMOVE_CJS_BLOCK, '').replace(STRIP_ESM_MARKERS, '') };
  },
};

export default defineConfig({
  plugins: [esmOnlyPlugin],
  define: {
    __DEBUG_BUILD__: true,
  },
  test: {
    coverage: {
      enabled: true,
      reportsDirectory: './coverage',
      exclude: [
        '**/node_modules/**',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/rollup*.config.*',
        '**/build/**',
        '.eslint*',
        'vite.config.*',
      ],
    },
    reporters: process.env.CI
      ? ['default', 'github-actions', ['junit', { classnameTemplate: '{filepath}' }]]
      : ['default'],
    outputFile: {
      junit: 'vitest.junit.xml',
    },
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
