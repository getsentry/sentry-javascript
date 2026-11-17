import { defineConfig } from 'vitest/config';

const REMOVE_CJS_BLOCK = /\/\*! rollup-include-cjs-only \*\/[\s\S]*?\/\*! rollup-include-cjs-only-end \*\/\s*/g;
const STRIP_ESM_MARKERS = /[ \t]*\/\*! rollup-include-esm-only(?:-end)? \*\/[ \t]*\r?\n?/g;

// Mirrors the ESM path of makeEsmCjsReplacePlugin from rollup-utils. Vitest
// transforms TypeScript source to ESM so tests see only the ESM branch.
// Runs before TS transpilation, which can move the marker comments.
const esmOnlyPlugin = {
  name: 'vitest-esm-only',
  enforce: 'pre' as const,
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
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
