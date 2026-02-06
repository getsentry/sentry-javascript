import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeModule,
  getServerFunctionWrapperCode,
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

      const code = "'use server';\nexport async function myAction() {}";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');
      expect(result).not.toBeNull();
    });

    it('does not detect RSC mode when only standard react-router plugin is present', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;
      plugin.configResolved(NON_RSC_PLUGINS_CONFIG);

      const code = "'use server';\nexport async function myAction() {}";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');
      expect(result).toBeNull();
    });

    it('does not wrap when configResolved has not been called', () => {
      const plugin = makeAutoInstrumentRSCPlugin({ enabled: true }) as PluginWithHooks;

      const code = "'use server';\nexport async function myAction() {}";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');
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
      const code = "'use server';\nexport async function myAction() {}";
      expect(plugin.transform(code, 'app/routes/rsc/actions.ts')).toBeNull();
    });

    it('returns null for non-TS/JS files', () => {
      const plugin = createPluginWithRSCDetected();
      expect(plugin.transform('some content', 'app/routes/styles.css')).toBeNull();
    });

    it('returns null for wrapped module suffix (prevents infinite loop)', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nexport async function myAction() {}";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts?sentry-rsc-wrap');
      expect(result).toBeNull();
    });

    it('returns null for server components (no "use server" directive)', () => {
      const plugin = createPluginWithRSCDetected();
      expect(plugin.transform('export default function Page() {}', 'app/routes/home.tsx')).toBeNull();
    });

    it('returns null for "use client" files', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use client';\nexport default function ClientComponent() {}";
      expect(plugin.transform(code, 'app/routes/client.tsx')).toBeNull();
    });

    it('returns null for files without directives or exports', () => {
      const plugin = createPluginWithRSCDetected();
      expect(plugin.transform("export function helper() { return 'helper'; }", 'app/routes/utils.tsx')).toBeNull();
    });

    // Server function auto-instrumentation ("use server" files)
    it('wraps "use server" files with server function wrapper code', () => {
      const plugin = createPluginWithRSCDetected();
      const code = [
        "'use server';",
        'export async function submitForm(data) { return data; }',
        'export async function getData() { return {}; }',
      ].join('\n');
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
      expect(result!.code).toContain("'use server'");
      expect(result!.code).toContain("import { wrapServerFunction } from '@sentry/react-router'");
      expect(result!.code).toContain('import * as _sentry_original from');
      expect(result!.code).toContain('app/routes/rsc/actions.ts?sentry-rsc-wrap');
      expect(result!.code).toContain('export const submitForm = wrapServerFunction("submitForm"');
      expect(result!.code).toContain('export const getData = wrapServerFunction("getData"');
    });

    it('wraps "use server" files preceded by comments', () => {
      const plugin = createPluginWithRSCDetected();
      const code = ['// Copyright 2024', '/* License */', "'use server';", 'export async function myAction() {}'].join(
        '\n',
      );
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('export const myAction = wrapServerFunction("myAction"');
    });

    it('returns null for "use server" files with no named exports', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nfunction internalHelper() {}";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).toBeNull();
    });

    it('skips "use server" files already containing wrapServerFunction', () => {
      const plugin = createPluginWithRSCDetected();
      const code = [
        "'use server';",
        "import { wrapServerFunction } from '@sentry/react-router';",
        "export const action = wrapServerFunction('action', _action);",
      ].join('\n');
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).toBeNull();
    });

    it('wraps "use server" files with export const pattern', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nexport const myAction = async () => {};";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('export const myAction = wrapServerFunction("myAction"');
    });

    it('logs debug messages when wrapping server functions', () => {
      const plugin = createPluginWithRSCDetected({ debug: true });
      const code = "'use server';\nexport async function myAction() {}";
      plugin.transform(code, 'app/routes/rsc/actions.ts');

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Sentry RSC] Auto-wrapping server functions:'));
    });

    it('logs debug messages when skipping "use server" file with no exports', () => {
      const plugin = createPluginWithRSCDetected({ debug: true });
      const code = "'use server';\nfunction internal() {}";
      plugin.transform(code, 'app/routes/rsc/actions.ts');

      // eslint-disable-next-line no-console
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Sentry RSC] Skipping server function file with no exports:'),
      );
    });

    it('wraps "use server" files with both named and default exports', () => {
      const plugin = createPluginWithRSCDetected();
      const code = [
        "'use server';",
        'export async function namedAction() { return {}; }',
        'export default async function defaultAction() { return {}; }',
      ].join('\n');
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('export const namedAction = wrapServerFunction("namedAction"');
      expect(result!.code).toContain('export default wrapServerFunction("default", _sentry_original.default)');
    });

    it('wraps "use server" files with only default export', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nexport default async function serverAction() { return {}; }";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
      expect(result!.code).toContain("'use server'");
      expect(result!.code).toContain('export default wrapServerFunction("default", _sentry_original.default)');
    });

    // Regression: ensures export class declarations are collected by the AST parser.
    // While exporting a class from "use server" is uncommon, the plugin should handle
    // it without crashing rather than silently skipping the export.
    it('wraps export class in a "use server" file', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nexport class MyService { async run() {} }";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
      expect(result!.code).toContain('export const MyService = wrapServerFunction("MyService"');
    });

    // Regression: export default async function name should be treated as default, not named
    it('does not extract "export default async function name" as a named export', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nexport default async function serverAction() { return {}; }";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
      // Should wrap as default, not as a named export called "serverAction"
      expect(result!.code).toContain('export default wrapServerFunction("default", _sentry_original.default)');
      expect(result!.code).not.toContain('export const serverAction');
    });

    it('wraps "use server" files regardless of their directory location', () => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nexport async function myAction() {}";

      // Should work from any directory, not just routes
      const result = plugin.transform(code, 'app/lib/server-actions.ts');
      expect(result).not.toBeNull();
      expect(result!.code).toContain('export const myAction = wrapServerFunction("myAction"');
    });

    it.each(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'])('wraps "use server" files with %s extension', ext => {
      const plugin = createPluginWithRSCDetected();
      const code = "'use server';\nexport async function action() {}";
      const result = plugin.transform(code, `app/routes/rsc/actions${ext}`);

      expect(result).not.toBeNull();
      expect(result!.code).toContain('wrapServerFunction');
    });

    it('does not log when debug is disabled', () => {
      const plugin = createPluginWithRSCDetected({ debug: false });

      plugin.transform("'use server';\nexport async function action() {}", 'app/routes/rsc/actions.ts');

      // eslint-disable-next-line no-console
      expect(console.log).not.toHaveBeenCalled();
      // eslint-disable-next-line no-console
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('analyzeModule', () => {
    // Named export extraction
    it('extracts export const declarations', () => {
      const code = "export const submitForm = wrapServerFunction('submitForm', _submitForm);";
      expect(analyzeModule(code)?.namedExports).toEqual(['submitForm']);
    });

    it('extracts export function declarations', () => {
      const code = 'export function submitForm(data) { return data; }';
      expect(analyzeModule(code)?.namedExports).toEqual(['submitForm']);
    });

    it('extracts export async function declarations', () => {
      const code = 'export async function fetchData() { return await fetch("/api"); }';
      expect(analyzeModule(code)?.namedExports).toEqual(['fetchData']);
    });

    it('extracts multiple exports', () => {
      const code = [
        'export async function submitForm(data) {}',
        'export async function getData() {}',
        'export const CONFIG = {};',
      ].join('\n');
      expect(analyzeModule(code)?.namedExports).toEqual(expect.arrayContaining(['submitForm', 'getData', 'CONFIG']));
      expect(analyzeModule(code)?.namedExports).toHaveLength(3);
    });

    it('extracts export { a, b, c } specifiers', () => {
      const code = 'function a() {}\nfunction b() {}\nexport { a, b }';
      expect(analyzeModule(code)?.namedExports).toEqual(['a', 'b']);
    });

    it('extracts aliased exports using the exported name', () => {
      const code = 'function _internal() {}\nexport { _internal as publicName }';
      expect(analyzeModule(code)?.namedExports).toEqual(['publicName']);
    });

    it('returns empty array when no exports are found', () => {
      const code = 'function helper() { return 42; }';
      expect(analyzeModule(code)?.namedExports).toEqual([]);
    });

    it('ignores export default', () => {
      const code = 'export default function Page() {}';
      expect(analyzeModule(code)?.namedExports).toEqual([]);
    });

    it('treats export { x as default } as a default export, not a named export', () => {
      const result = analyzeModule('function myFunc() {}\nexport { myFunc as default }');
      expect(result?.namedExports).toEqual([]);
      expect(result?.hasDefaultExport).toBe(true);
    });

    it('deduplicates exports', () => {
      const code = 'export const a = 1;\nexport { a }';
      expect(analyzeModule(code)?.namedExports).toEqual(['a']);
    });

    it('handles mixed export styles', () => {
      const code = [
        'export const a = 1;',
        'export function b() {}',
        'export async function c() {}',
        'function d() {}',
        'export { d }',
      ].join('\n');
      expect(analyzeModule(code)?.namedExports).toEqual(['a', 'b', 'c', 'd']);
    });

    it('ignores type-only exports', () => {
      const code = [
        'export type MyType = string;',
        'export interface MyInterface {}',
        'export const realExport = 1;',
      ].join('\n');
      expect(analyzeModule(code)?.namedExports).toEqual(['realExport']);
    });

    it('ignores inline type exports in export { type X }', () => {
      const code = 'type Foo = string;\ntype Baz = number;\nconst bar = 1;\nexport { type Foo, bar, type Baz as Qux }';
      expect(analyzeModule(code)?.namedExports).toEqual(['bar']);
    });

    it('ignores type-only export specifiers mixed with regular exports', () => {
      const code = ['type MyType = string;', 'const a = 1;', 'const b = 2;', 'export { type MyType, a, b }'].join('\n');
      expect(analyzeModule(code)?.namedExports).toEqual(['a', 'b']);
    });

    it('extracts export class declarations', () => {
      expect(analyzeModule('export class MyClass {}')?.namedExports).toEqual(['MyClass']);
    });

    // Regression test: export default async function does not appear as named export
    it('does not extract "export default async function name" as a named export', () => {
      const result = analyzeModule('export default async function serverAction() { return {}; }');
      expect(result?.namedExports).toEqual([]);
      expect(result?.hasDefaultExport).toBe(true);
    });

    // Directive detection
    it('detects "use server" directive', () => {
      const result = analyzeModule("'use server';\nexport async function action() {}");
      expect(result?.hasUseServerDirective).toBe(true);
    });

    it('detects "use server" combined with "use strict"', () => {
      const result = analyzeModule("'use strict';\n'use server';\nexport async function action() {}");
      expect(result?.hasUseServerDirective).toBe(true);
    });

    it('does not treat "use server" inside a comment as a directive', () => {
      const result = analyzeModule('// "use server"\nexport async function action() {}');
      expect(result?.hasUseServerDirective).toBe(false);
    });

    it('does not treat "use server" inside a string as a directive', () => {
      const result = analyzeModule('const x = "use server";\nexport async function action() {}');
      expect(result?.hasUseServerDirective).toBe(false);
    });

    // Default export detection
    it('detects default export', () => {
      expect(analyzeModule('export default function Page() {}')?.hasDefaultExport).toBe(true);
    });

    it('reports no default export when none exists', () => {
      expect(analyzeModule('export function helper() {}')?.hasDefaultExport).toBe(false);
    });

    // Manual wrapping detection
    it('detects manual wrapping with wrapServerFunction import', () => {
      const code =
        "import { wrapServerFunction } from '@sentry/react-router';\nexport const action = wrapServerFunction('action', _action);";
      expect(analyzeModule(code)?.hasManualServerFunctionWrapping).toBe(true);
    });

    it('does not treat wrapServerFunction in a comment as manual wrapping', () => {
      const result = analyzeModule(
        "// import { wrapServerFunction } from '@sentry/react-router';\nexport async function action() {}",
      );
      expect(result?.hasManualServerFunctionWrapping).toBe(false);
    });

    // Parse failure
    it('returns null for unparseable code', () => {
      expect(analyzeModule('this is not valid {{{')).toBeNull();
    });
  });

  describe('getServerFunctionWrapperCode', () => {
    it('generates wrapper code with use server directive', () => {
      const result = getServerFunctionWrapperCode('/app/routes/rsc/actions.ts', ['submitForm', 'getData']);

      expect(result).toContain("'use server'");
      expect(result).toContain("import { wrapServerFunction } from '@sentry/react-router'");
      expect(result).toContain('import * as _sentry_original from');
      expect(result).toContain('/app/routes/rsc/actions.ts?sentry-rsc-wrap');
    });

    it('wraps each named export with wrapServerFunction', () => {
      const result = getServerFunctionWrapperCode('/app/routes/rsc/actions.ts', ['submitForm', 'getData']);

      expect(result).toContain(
        'export const submitForm = wrapServerFunction("submitForm", _sentry_original["submitForm"])',
      );
      expect(result).toContain('export const getData = wrapServerFunction("getData", _sentry_original["getData"])');
    });

    it('handles a single export', () => {
      const result = getServerFunctionWrapperCode('/app/routes/rsc/actions.ts', ['myAction']);

      expect(result).toContain('export const myAction = wrapServerFunction("myAction", _sentry_original["myAction"])');
    });

    it('escapes special characters in export names via JSON.stringify', () => {
      const result = getServerFunctionWrapperCode('/app/routes/actions.ts', ['$action']);

      expect(result).toContain('export const $action = wrapServerFunction("$action", _sentry_original["$action"])');
    });

    it('includes wrapped default export when includeDefault is true', () => {
      const result = getServerFunctionWrapperCode('/app/routes/actions.ts', ['namedAction'], true);

      expect(result).toContain(
        'export const namedAction = wrapServerFunction("namedAction", _sentry_original["namedAction"])',
      );
      expect(result).toContain('export default wrapServerFunction("default", _sentry_original.default)');
    });

    it('does not include default export when includeDefault is false', () => {
      const result = getServerFunctionWrapperCode('/app/routes/actions.ts', ['namedAction'], false);

      expect(result).toContain('export const namedAction = wrapServerFunction("namedAction"');
      expect(result).not.toContain('export default');
    });

    it('handles file with only default export when includeDefault is true', () => {
      const result = getServerFunctionWrapperCode('/app/routes/actions.ts', [], true);

      expect(result).toContain("'use server'");
      expect(result).toContain('export default wrapServerFunction("default", _sentry_original.default)');
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
      const code = "'use server';\nexport async function action() {}";
      const result = plugin.transform(code, 'app/routes/rsc/actions.ts');

      expect(result).not.toBeNull();
    });
  });
});
