import { describe, expect, it } from 'vitest';
import type { LoaderThis } from '../../src/config/loaders/types';
import type { ValueInjectionLoaderOptions } from '../../src/config/loaders/valueInjectionLoader';
import valueInjectionLoader from '../../src/config/loaders/valueInjectionLoader';

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
});
