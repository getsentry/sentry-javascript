import { getDebugIdSnippet } from '../../src/core';
import { containsOnlyImports } from '../../src/core/utils';
import { describe, it, expect } from 'vitest';

describe('getDebugIdSnippet', () => {
  it('returns the debugId injection snippet for a passed debugId', () => {
    const snippet = getDebugIdSnippet('1234');
    expect(snippet.code()).toMatchInlineSnapshot(
      `"!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="1234",e._sentryDebugIdIdentifier="sentry-dbid-1234");}catch(e){}}();"`,
    );
  });
});

describe('containsOnlyImports', () => {
  describe('should return true (import-only code)', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   \n\t  '],
      ['side effect import with single quotes', "import './module.js';"],
      ['side effect import with double quotes', 'import "./module.js";'],
      ['side effect import with backticks', 'import `./module.js`;'],
      ['side effect import without semicolon', "import './module.js'"],
      ['default import', "import foo from './module.js';"],
      ['named import', "import { foo } from './module.js';"],
      ['named import with alias', "import { foo as bar } from './module.js';"],
      ['multiple named imports', "import { foo, bar, baz } from './module.js';"],
      ['namespace import', "import * as utils from './utils.js';"],
      ['default and named imports', "import React, { useState } from 'react';"],
      ['re-export all', "export * from './module.js';"],
      ['re-export named', "export { foo, bar } from './module.js';"],
      ['re-export with alias', "export { foo as default } from './module.js';"],
    ])('%s', (_, code) => {
      expect(containsOnlyImports(code)).toBe(true);
    });

    it.each([
      [
        'multiple imports',
        `
import './polyfill.js';
import { helper } from './utils.js';
import config from './config.js';
`,
      ],
      [
        'imports with line comments',
        `
// This is a comment
import './module.js';
// Another comment
`,
      ],
      [
        'imports with block comments',
        `
/* Block comment */
import './module.js';
/* Multi
   line
   comment */
`,
      ],
      ["'use strict' with imports", `"use strict";\nimport './module.js';`],
      ["'use strict' with single quotes", `'use strict';\nimport './module.js';`],
      [
        'mixed imports, re-exports, and comments',
        `
"use strict";
// Entry point facade
import './polyfills.js';
import { init } from './app.js';
/* Re-export for external use */
export * from './types.js';
export { config } from './config.js';
`,
      ],
    ])('%s', (_, code) => {
      expect(containsOnlyImports(code)).toBe(true);
    });
  });

  describe('should return false (contains substantial code)', () => {
    it.each([
      ['variable declaration', 'const x = 1;'],
      ['let declaration', 'let y = 2;'],
      ['var declaration', 'var z = 3;'],
      ['function declaration', 'function foo() {}'],
      ['arrow function', 'const fn = () => {};'],
      ['class declaration', 'class MyClass {}'],
      ['function call', "console.log('hello');"],
      ['IIFE', '(function() {})();'],
      ['expression statement', '1 + 1;'],
      ['object literal', "({ foo: 'bar' });"],
      ['export declaration (not re-export)', 'export const foo = 1;'],
      ['export default expression', 'export default {};'],
      ['export function', 'export function foo() {}'],
      ['minified bundle code', `import{a as e}from"./chunk.js";var t=function(){return e()};t();`],
    ])('%s', (_, code) => {
      expect(containsOnlyImports(code)).toBe(false);
    });

    // Multi-line code snippets
    it.each([
      [
        'import followed by code',
        `
import { init } from './app.js';
init();
`,
      ],
      [
        'import with variable declaration',
        `
import './module.js';
const config = { debug: true };
`,
      ],
      [
        'import with function declaration',
        `
import { helper } from './utils.js';
function main() {
  helper();
}
`,
      ],
      [
        'real-world SPA bundle snippet',
        `
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(router);
app.mount('#app');
`,
      ],
    ])('%s', (_, code) => {
      expect(containsOnlyImports(code)).toBe(false);
    });
  });
});
