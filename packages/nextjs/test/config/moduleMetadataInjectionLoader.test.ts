import { describe, expect, it } from 'vitest';
import type { ModuleMetadataInjectionLoaderOptions } from '../../src/config/loaders/moduleMetadataInjectionLoader';
import moduleMetadataInjectionLoader from '../../src/config/loaders/moduleMetadataInjectionLoader';
import type { LoaderThis } from '../../src/config/loaders/types';

function createLoaderThis(
  applicationKey: string,
  useGetOptions = true,
): LoaderThis<ModuleMetadataInjectionLoaderOptions> {
  const base = {
    addDependency: () => undefined,
    async: () => undefined,
    cacheable: () => undefined,
    callback: () => undefined,
    resourcePath: './app/page.tsx',
  };

  if (useGetOptions) {
    return { ...base, getOptions: () => ({ applicationKey }) } as LoaderThis<ModuleMetadataInjectionLoaderOptions>;
  }

  return { ...base, query: { applicationKey } } as LoaderThis<ModuleMetadataInjectionLoaderOptions>;
}

describe('moduleMetadataInjectionLoader', () => {
  it('should inject metadata snippet into simple code', () => {
    const loaderThis = createLoaderThis('my-app');
    const userCode = "import * as Sentry from '@sentry/nextjs';\nSentry.init();";

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    expect(result).toContain('_sentryModuleMetadata');
    expect(result).toContain('_sentryBundlerPluginAppKey:my-app');
    // Wrapped in try-catch IIFE
    expect(result).toContain('!function(){try{');
  });

  it('should inject after "use strict" directive', () => {
    const loaderThis = createLoaderThis('my-app');
    const userCode = '"use strict";\nconsole.log("hello");';

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    const metadataIndex = result.indexOf('_sentryModuleMetadata');
    const directiveIndex = result.indexOf('"use strict"');
    expect(metadataIndex).toBeGreaterThan(directiveIndex);
  });

  it('should inject after "use client" directive', () => {
    const loaderThis = createLoaderThis('my-app');
    const userCode = '"use client";\nimport React from \'react\';';

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    const metadataIndex = result.indexOf('_sentryModuleMetadata');
    const directiveIndex = result.indexOf('"use client"');
    expect(metadataIndex).toBeGreaterThan(directiveIndex);
  });

  it('should handle code with leading comments before directives', () => {
    const loaderThis = createLoaderThis('my-app');
    const userCode = '// some comment\n"use client";\nimport React from \'react\';';

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    expect(result).toContain('_sentryBundlerPluginAppKey:my-app');
    const metadataIndex = result.indexOf('_sentryModuleMetadata');
    const directiveIndex = result.indexOf('"use client"');
    expect(metadataIndex).toBeGreaterThan(directiveIndex);
  });

  it('should handle code with block comments before directives', () => {
    const loaderThis = createLoaderThis('my-app');
    const userCode = '/* block comment */\n"use client";\nimport React from \'react\';';

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    expect(result).toContain('_sentryBundlerPluginAppKey:my-app');
  });

  it('should set cacheable to false', () => {
    let cacheableValue: boolean | undefined;
    const loaderThis = {
      addDependency: () => undefined,
      async: () => undefined,
      cacheable: (flag: boolean) => {
        cacheableValue = flag;
      },
      callback: () => undefined,
      resourcePath: './app/page.tsx',
      getOptions: () => ({ applicationKey: 'my-app' }),
    } as LoaderThis<ModuleMetadataInjectionLoaderOptions>;

    moduleMetadataInjectionLoader.call(loaderThis, 'const x = 1;');

    expect(cacheableValue).toBe(false);
  });

  it('should work with webpack 4 query API', () => {
    const loaderThis = createLoaderThis('my-app', false);
    const userCode = 'const x = 1;';

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    expect(result).toContain('_sentryBundlerPluginAppKey:my-app');
  });

  it('should use try-catch IIFE pattern matching the webpack plugin', () => {
    const loaderThis = createLoaderThis('my-app');
    const userCode = 'const x = 1;';

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    // Should be wrapped in a try-catch IIFE so injection failures never break the module
    expect(result).toContain('!function(){try{');
    expect(result).toContain('}catch(e){}}();');
    // Should resolve the global object like the webpack plugin does
    expect(result).toContain('typeof window');
    expect(result).toContain('typeof globalThis');
    // Should key by stack trace like the webpack plugin does
    expect(result).toContain('e._sentryModuleMetadata[(new e.Error).stack]');
    // Should use Object.assign to merge metadata
    expect(result).toContain('Object.assign({}');
  });

  it('should contain the correct app key format in output', () => {
    const loaderThis = createLoaderThis('test-key-123');
    const userCode = 'export default function Page() {}';

    const result = moduleMetadataInjectionLoader.call(loaderThis, userCode);

    expect(result).toContain('"_sentryBundlerPluginAppKey:test-key-123":true');
  });
});
