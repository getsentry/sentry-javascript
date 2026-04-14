import { describe, expect, it } from 'vitest';
import type { LoaderThis } from '../../src/config/loaders/types';
import type { ValueInjectionLoaderOptions } from '../../src/config/loaders/valueInjectionLoader';
import valueInjectionLoader, { findInjectionIndexAfterDirectives } from '../../src/config/loaders/valueInjectionLoader';

const defaultLoaderThis = {
  addDependency: () => undefined,
  async: () => undefined,
  cacheable: () => undefined,
  callback: () => undefined,
  getOptions() {
    return {
      values: {
        foo: 'bar',
      },
    };
  },
};

const clientConfigLoaderThis = {
  ...defaultLoaderThis,
  resourcePath: './sentry.client.config.ts',
} satisfies LoaderThis<ValueInjectionLoaderOptions>;

const instrumentationLoaderThis = {
  ...defaultLoaderThis,
  resourcePath: './instrumentation-client.js',
} satisfies LoaderThis<ValueInjectionLoaderOptions>;

describe.each([[clientConfigLoaderThis], [instrumentationLoaderThis]])('valueInjectionLoader', loaderThis => {
  it('should correctly insert values for basic config', () => {
    const userCode = `
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values with directive', () => {
    const userCode = `
      "use client"
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values with directive and semicolon', () => {
    const userCode = `
      "use client";
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values with a single-quoted directive', () => {
    const userCode = `
      'use client';
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    const injectionIndex = result.indexOf(';globalThis["foo"] = "bar";');
    const clientDirectiveIndex = result.indexOf("'use client'");
    const importIndex = result.indexOf("import * as Sentry from '@sentry/nextjs';");

    expect(injectionIndex).toBeGreaterThan(clientDirectiveIndex);
    expect(injectionIndex).toBeLessThan(importIndex);
  });

  it('should correctly insert values with directive and inline comments', () => {
    const userCode = `
      // test
      "use client";
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values with directive and block comments', () => {
    const userCode = `
      /* test */
      "use client";
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values with directive and multiline block comments', () => {
    const userCode = `
      /*
        test
      */
      "use client";
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values with directive and multiline block comments and a bunch of whitespace', () => {
    const userCode = `
      /*
        test
      */




      "use client";



      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values with a misplaced directive', () => {
    const userCode = `
      console.log('This will render the directive useless');
      "use client";



      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    expect(result).toMatchSnapshot();
    expect(result).toMatch(';globalThis["foo"] = "bar";');
  });

  it('should correctly insert values after multiple directives', () => {
    const userCode = `
      "use strict";
      "use client";
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    const injectionIndex = result.indexOf(';globalThis["foo"] = "bar";');
    const clientDirectiveIndex = result.indexOf('"use client"');
    const importIndex = result.indexOf("import * as Sentry from '@sentry/nextjs';");

    expect(injectionIndex).toBeGreaterThan(clientDirectiveIndex);
    expect(injectionIndex).toBeLessThan(importIndex);
  });

  it('should correctly insert values after comments between multiple directives', () => {
    const userCode = `
      "use strict";
      /* keep */
      "use client";
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    const injectionIndex = result.indexOf(';globalThis["foo"] = "bar";');
    const clientDirectiveIndex = result.indexOf('"use client"');

    expect(injectionIndex).toBeGreaterThan(clientDirectiveIndex);
  });

  it('should correctly insert values after semicolon-free directives', () => {
    const userCode = `
      "use strict"
      "use client"
      import * as Sentry from '@sentry/nextjs';
      Sentry.init();
    `;

    const result = valueInjectionLoader.call(loaderThis, userCode);

    const injectionIndex = result.indexOf(';globalThis["foo"] = "bar";');
    const clientDirectiveIndex = result.indexOf('"use client"');

    expect(injectionIndex).toBeGreaterThan(clientDirectiveIndex);
  });
});

describe('findInjectionIndexAfterDirectives', () => {
  it('returns the position immediately after the last directive', () => {
    const userCode = '"use strict";\n"use client";\nimport React from \'react\';';

    expect(userCode.slice(findInjectionIndexAfterDirectives(userCode))).toBe("\nimport React from 'react';");
  });

  it('returns the end of the input when the last directive reaches EOF', () => {
    const userCode = '"use strict";\n"use client";';

    expect(findInjectionIndexAfterDirectives(userCode)).toBe(userCode.length);
  });

  it('does not skip a string literal that is not a directive', () => {
    const userCode = '"use client" + suffix;';

    expect(findInjectionIndexAfterDirectives(userCode)).toBe(0);
  });

  it('does not treat an escaped quote at EOF as a closed directive', () => {
    const userCode = '"use client\\"';

    expect(findInjectionIndexAfterDirectives(userCode)).toBe(0);
  });

  it('returns 0 for an unterminated leading block comment', () => {
    const userCode = '/* unterminated';

    expect(findInjectionIndexAfterDirectives(userCode)).toBe(0);
  });

  it('returns the last complete directive when followed by an unterminated block comment', () => {
    const userCode = '"use client"; /* unterminated';

    expect(findInjectionIndexAfterDirectives(userCode)).toBe('"use client";'.length);
  });

  it('treats a block comment without a line break as part of the same statement', () => {
    const userCode = '"use client" /* comment */ + suffix;';

    expect(findInjectionIndexAfterDirectives(userCode)).toBe(0);
  });
});
