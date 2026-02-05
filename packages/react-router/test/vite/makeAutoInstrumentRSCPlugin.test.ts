import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filePathToRoute,
  getWrapperCode,
  makeAutoInstrumentRSCPlugin,
} from '../../src/vite/makeAutoInstrumentRSCPlugin';

vi.spyOn(console, 'log').mockImplementation(() => {
  /* noop */
});
vi.spyOn(console, 'warn').mockImplementation(() => {
  /* noop */
});

type PluginWithHooks = Plugin & {
  configResolved: (config: { plugins: Array<{ name: string }> }) => void;
  resolveId: (source: string) => string | null;
  load: (id: string) => Promise<string | null>;
  transform: (code: string, id: string) => { code: string; map: null } | null;
};

const RSC_PLUGINS_CONFIG = { plugins: [{ name: 'react-router/rsc' }] };
const NON_RSC_PLUGINS_CONFIG = { plugins: [{ name: 'react-router' }] };

/** Creates a plugin with RSC mode detected (simulates `configResolved` with RSC plugins). */
function createPluginWithRSCDetected(options: Parameters<typeof makeAutoInstrumentRSCPlugin>[0] = {}): PluginWithHooks {
  const plugin = makeAutoInstrumentRSCPlugin(options) as PluginWithHooks;
  plugin.configResolved(RSC_PLUGINS_CONFIG);
  return plugin;
}

describe('makeAutoInstrumentRSCPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('filePathToRoute', () => {
    it('converts a standard route path', () => {
      expect(filePathToRoute('app/routes/rsc/server-component.tsx', 'app/routes')).toBe('/rsc/server-component');
    });

    it('converts an index route to the parent directory path', () => {
      expect(filePathToRoute('app/routes/performance/index.tsx', 'app/routes')).toBe('/performance');
    });

    it('converts a root index route to /', () => {
      expect(filePathToRoute('app/routes/index.tsx', 'app/routes')).toBe('/');
    });

    it('converts deeply nested route paths', () => {
      expect(filePathToRoute('app/routes/a/b/c.tsx', 'app/routes')).toBe('/a/b/c');
    });

    it('normalizes Windows-style backslash paths', () => {
      expect(filePathToRoute('app\\routes\\rsc\\server-component.tsx', 'app\\routes')).toBe('/rsc/server-component');
    });

    it('uses a custom routes directory', () => {
      expect(filePathToRoute('src/pages/dashboard/overview.tsx', 'src/pages')).toBe('/dashboard/overview');
    });

    it('returns / when the routes directory is not found in the path', () => {
      expect(filePathToRoute('other/directory/file.tsx', 'app/routes')).toBe('/');
    });

    it('handles various file extensions', () => {
      expect(filePathToRoute('app/routes/home.js', 'app/routes')).toBe('/home');
      expect(filePathToRoute('app/routes/home.jsx', 'app/routes')).toBe('/home');
      expect(filePathToRoute('app/routes/home.ts', 'app/routes')).toBe('/home');
      expect(filePathToRoute('app/routes/home.mjs', 'app/routes')).toBe('/home');
      expect(filePathToRoute('app/routes/home.mts', 'app/routes')).toBe('/home');
    });

    it('handles absolute paths containing the routes directory', () => {
      expect(filePathToRoute('/Users/dev/project/app/routes/dashboard.tsx', 'app/routes')).toBe('/dashboard');
    });

    it('converts $param segments to :param', () => {
      expect(filePathToRoute('app/routes/users/$userId.tsx', 'app/routes')).toBe('/users/:userId');
    });

    it('converts multiple $param segments', () => {
      expect(filePathToRoute('app/routes/$org/$repo/settings.tsx', 'app/routes')).toBe('/:org/:repo/settings');
    });

    it('uses the last occurrence of the routes directory to determine path', () => {
      expect(filePathToRoute('/project/routes-app/app/routes/page.tsx', 'routes')).toBe('/page');
    });

    it('does not match partial directory names', () => {
      expect(filePathToRoute('/project/my-routes/page.tsx', 'routes')).toBe('/');
      expect(filePathToRoute('/project/custom-routes/page.tsx', 'routes')).toBe('/');
    });

    it('uses the correct path segment when a later directory starts with the routes directory name', () => {
      expect(filePathToRoute('/project/routes/sub/routesXtra/page.tsx', 'routes')).toBe('/sub/routesXtra/page');
    });

    it('does not interpret dot-delimited flat file convention (known limitation)', () => {
      // React Router supports `routes/rsc.page.tsx` as a flat route for `/rsc/page`,
      // but this function treats dots literally since it only supports directory-based routing.
      expect(filePathToRoute('app/routes/rsc.page.tsx', 'app/routes')).toBe('/rsc.page');
    });
  });

  describe('getWrapperCode', () => {
    it('generates wrapper code with correct imports and exports', () => {
      const result = getWrapperCode('/app/routes/page.tsx', '/page');

      expect(result).toContain("import { wrapServerComponent } from '@sentry/react-router'");
      expect(result).toContain('import _SentryComponent from');
      expect(result).toContain('/app/routes/page.tsx?sentry-rsc-wrap');
      expect(result).toContain('componentRoute: "/page"');
      expect(result).toContain("componentType: 'Page'");
      expect(result).toContain('export default wrapServerComponent(_SentryComponent,');
      expect(result).toContain('export * from');
    });

    it('handles route paths containing single quotes via JSON.stringify', () => {
      const result = getWrapperCode('/app/routes/page.tsx', "/user's-page");
      expect(result).toContain('componentRoute: "/user\'s-page"');
    });

    it('escapes backslashes in route paths', () => {
      const result = getWrapperCode('/app/routes/page.tsx', '/path\\route');
      expect(result).toContain('componentRoute: "/path\\\\route"');
    });

    it('uses JSON.stringify for the module id to handle special characters', () => {
      const result = getWrapperCode('/app/routes/page.tsx', '/page');
      expect(result).toContain('"/app/routes/page.tsx?sentry-rsc-wrap"');
    });
  });

  describe('resolveId', () => {
    it('resolves modules with the wrapped suffix', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;
      expect(plugin.resolveId('/app/routes/page.tsx?sentry-rsc-wrap')).toBe('/app/routes/page.tsx?sentry-rsc-wrap');
    });

    it('returns null for normal modules', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;
      expect(plugin.resolveId('/app/routes/page.tsx')).toBeNull();
    });
  });

  describe('load', () => {
    it('returns null for non-wrapped modules', async () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;
      await expect(plugin.load('/app/routes/page.tsx')).resolves.toBeNull();
    });

    it('reads the original file for wrapped modules', async () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;
      const result = await plugin.load(`${__filename}?sentry-rsc-wrap`);
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
      expect(result).toContain('makeAutoInstrumentRSCPlugin');
    });

    it('returns null and logs when the original file does not exist', async () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true, debug: true }) as PluginWithHooks;
      const result = await plugin.load('/nonexistent/file.tsx?sentry-rsc-wrap');
      expect(result).toBeNull();
      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Sentry RSC] Failed to read original file:'));
    });
  });

  describe('configResolved', () => {
    it('detects RSC mode when react-router/rsc plugin is present', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;
      plugin.configResolved(RSC_PLUGINS_CONFIG);

      const result = plugin.transform(
        'export default function Page() {\n  return <div>Page</div>;\n}',
        'app/routes/home.tsx',
      );
      expect(result).not.toBeNull();
    });

    it('does not detect RSC mode when only standard react-router plugin is present', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;
      plugin.configResolved(NON_RSC_PLUGINS_CONFIG);

      const result = plugin.transform(
        'export default function Page() {\n  return <div>Page</div>;\n}',
        'app/routes/home.tsx',
      );
      expect(result).toBeNull();
    });

    it('does not wrap when configResolved has not been called', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;

      const result = plugin.transform(
        'export default function Page() {\n  return <div>Page</div>;\n}',
        'app/routes/home.tsx',
      );
      expect(result).toBeNull();
    });

    it('logs detection status when debug is enabled', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true, debug: true }) as PluginWithHooks;
      plugin.configResolved(RSC_PLUGINS_CONFIG);

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith('[Sentry RSC] RSC mode detected');
    });

    it('logs non-detection status when debug is enabled', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true, debug: true }) as PluginWithHooks;
      plugin.configResolved(NON_RSC_PLUGINS_CONFIG);

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith('[Sentry RSC] RSC mode not detected');
    });
  });

  describe('transform', () => {
    it('returns null when disabled', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: false }) as PluginWithHooks;
      expect(plugin.transform('export default function Page() {}', 'app/routes/home.tsx')).toBeNull();
    });

    it('returns null for non-TS/JS files', () => {
      const plugin = createPluginWithRSCDetected();
      expect(plugin.transform('some content', 'app/routes/styles.css')).toBeNull();
    });

    it('returns null for files outside the routes directory', () => {
      const plugin = createPluginWithRSCDetected();
      expect(plugin.transform('export default function Page() {}', 'app/components/MyComponent.tsx')).toBeNull();
    });

    it('returns null for files in a directory with a similar prefix to the routes directory', () => {
      const plugin = createPluginWithRSCDetected();
      expect(plugin.transform('export default function Page() {}', 'app/routes-archive/old.tsx')).toBeNull();
    });

    it('returns null for files in directories that partially match the routes directory', () => {
      const plugin = createPluginWithRSCDetected({ routesDirectory: 'routes' });
      expect(plugin.transform('export default function Page() {}', '/project/my-routes/page.tsx')).toBeNull();
    });

    it('returns null for wrapped module suffix (prevents infinite loop)', () => {
      const plugin = createPluginWithRSCDetected();
      const result = plugin.transform('export default function Page() {}', 'app/routes/home.tsx?sentry-rsc-wrap');
      expect(result).toBeNull();
    });

    it('returns null for files with "use client" directive', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use client';\nexport default function ClientComponent() {}";
      expect(plugin.transform(code, 'app/routes/client.tsx')).toBeNull();
    });

    it('returns null for files with "use client" directive using double quotes', () => {
      const plugin = createPluginWithRSCDetected();
      const code = '"use client";\nexport default function ClientComponent() {}';
      expect(plugin.transform(code, 'app/routes/client.tsx')).toBeNull();
    });

    it('returns null for files with "use client" preceded by line comments', () => {
      const plugin = createPluginWithRSCDetected();
      const code = [
        '// Copyright 2024 Company Inc.',
        '// Licensed under MIT License',
        '// See LICENSE file for details',
        '// Generated by framework-codegen v3.2',
        '// Do not edit manually',
        "'use client';",
        'export default function ClientComponent() {}',
      ].join('\n');
      expect(plugin.transform(code, 'app/routes/client.tsx')).toBeNull();
    });

    it('returns null for files with "use client" preceded by a block comment', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "/* License header\n * spanning multiple lines\n */\n'use client';\nexport default function C() {}";
      expect(plugin.transform(code, 'app/routes/client.tsx')).toBeNull();
    });

    it('returns null for files already wrapped with wrapServerComponent', () => {
      const plugin = createPluginWithRSCDetected();
      const code =
        "import { wrapServerComponent } from '@sentry/react-router';\nexport default wrapServerComponent(MyComponent, {});";
      expect(plugin.transform(code, 'app/routes/home.tsx')).toBeNull();
    });

    it('returns null for files without a default export', () => {
      const plugin = createPluginWithRSCDetected();
      expect(plugin.transform("export function helper() { return 'helper'; }", 'app/routes/utils.tsx')).toBeNull();
    });

    it('returns wrapper code for a server component with named function export', () => {
      const plugin = createPluginWithRSCDetected();
      const result = plugin.transform(
        'export default function HomePage() {\n  return <div>Home</div>;\n}',
        'app/routes/home.tsx',
      );

      expect(result).not.toBeNull();
      expect(result!.code).toContain("import { wrapServerComponent } from '@sentry/react-router'");
      expect(result!.code).toContain('import _SentryComponent from');
      expect(result!.code).toContain('app/routes/home.tsx?sentry-rsc-wrap');
      expect(result!.code).toContain('componentRoute: "/home"');
      expect(result!.code).toContain("componentType: 'Page'");
      expect(result!.code).toContain('export default wrapServerComponent(_SentryComponent,');
      expect(result!.code).toContain('export * from');
      expect(result!.map).toBeNull();
    });

    it('returns wrapper code for a server component with arrow function export', () => {
      const plugin = createPluginWithRSCDetected();
      const result = plugin.transform('export default () => <div>Arrow</div>', 'app/routes/arrow.tsx');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('componentRoute: "/arrow"');
    });

    it('returns wrapper code for a server component with identifier export', () => {
      const plugin = createPluginWithRSCDetected();
      const result = plugin.transform('function MyComponent() {}\nexport default MyComponent;', 'app/routes/ident.tsx');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('componentRoute: "/ident"');
    });

    it('returns wrapper code for a server component with anonymous function export', () => {
      const plugin = createPluginWithRSCDetected();
      const result = plugin.transform('export default function() { return <div>Anon</div>; }', 'app/routes/anon.tsx');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('componentRoute: "/anon"');
    });

    it('returns wrapper code for a server component with class export', () => {
      const plugin = createPluginWithRSCDetected();
      const result = plugin.transform('export default class MyComponent {}', 'app/routes/class-comp.tsx');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('componentRoute: "/class-comp"');
    });

    it('uses a custom routes directory', () => {
      const plugin = createPluginWithRSCDetected({ routesDirectory: 'src/pages' });
      const result = plugin.transform(
        'export default function Dashboard() {\n  return <div>Dashboard</div>;\n}',
        'src/pages/dashboard.tsx',
      );

      expect(result).not.toBeNull();
      expect(result!.code).toContain('componentRoute: "/dashboard"');
    });

    it.each(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'])('wraps files with %s extension', ext => {
      const plugin = createPluginWithRSCDetected();
      const code = 'export default function Page() {\n  return <div>Page</div>;\n}';
      const result = plugin.transform(code, `app/routes/home${ext}`);

      expect(result).not.toBeNull();
      expect(result!.code).toContain('componentRoute: "/home"');
    });

    it('logs debug messages when debug is enabled and a client component is skipped', () => {
      const plugin = createPluginWithRSCDetected({ debug: true });
      plugin.transform("'use client';\nexport default function C() {}", 'app/routes/client.tsx');

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Sentry RSC] Skipping client component:'));
    });

    it('logs debug messages when a file is already wrapped', () => {
      const plugin = createPluginWithRSCDetected({ debug: true });
      plugin.transform(
        "import { wrapServerComponent } from '@sentry/react-router';\nexport default wrapServerComponent(Page, {});",
        'app/routes/wrapped.tsx',
      );

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Sentry RSC] Skipping already wrapped:'));
    });

    it('logs debug messages when no default export is found', () => {
      const plugin = createPluginWithRSCDetected({ debug: true });
      plugin.transform('export function helper() {}', 'app/routes/helper.tsx');

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Sentry RSC] Skipping no default export:'));
    });

    it('logs debug messages when wrapping succeeds', () => {
      const plugin = createPluginWithRSCDetected({ debug: true });
      plugin.transform('export default function Page() {\n  return <div>Page</div>;\n}', 'app/routes/home.tsx');

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Sentry RSC] Auto-wrapping server component:'));
    });

    it('does not log when debug is disabled', () => {
      const plugin = createPluginWithRSCDetected({ debug: false });

      plugin.transform("'use client';\nexport default function C() {}", 'app/routes/c.tsx');
      plugin.transform('export function helper() {}', 'app/routes/h.tsx');
      plugin.transform('export default function P() {}', 'app/routes/p.tsx');

      // eslint-disable-next-line no-console
      expect(console.log).not.toHaveBeenCalled();
      // eslint-disable-next-line no-console
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('plugin creation', () => {
    it('creates a plugin with the correct name and enforce value', () => {
      const plugin = makeAutoInstrumentRSCPlugin();

      expect(plugin.name).toBe('sentry-react-router-rsc-auto-instrument');
      expect(plugin.enforce).toBe('pre');
    });

    it('defaults to enabled when no options are provided', () => {
      const plugin = createPluginWithRSCDetected();
      const result = plugin.transform(
        'export default function Page() {\n  return <div>Page</div>;\n}',
        'app/routes/home.tsx',
      );

      expect(result).not.toBeNull();
    });
  });
});
