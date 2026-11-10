import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { applyAutoInstrumentTransforms, type ClassWrapperKind, type TransformContext } from '../../src/vite/transform';
import { DEFAULT_EXPORT } from '../../src/vite/wranglerConfig';

function parseJS(code: string) {
  return parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as { body: any[] };
}

/** Build a `classWrappers` map with every given class name marked as a DO. */
function doWrappers(...names: string[]): Map<string, ClassWrapperKind> {
  return new Map(names.map(name => [name, 'durableObject']));
}

/** Build a `classWrappers` map with every given class name marked as a Workflow. */
function workflowWrappers(...names: string[]): Map<string, ClassWrapperKind> {
  return new Map(names.map(name => [name, 'workflow']));
}

/** Build a `classWrappers` map with every given class name marked as a WorkerEntrypoint. */
function entrypointWrappers(...names: string[]): Map<string, ClassWrapperKind> {
  return new Map(names.map(name => [name, 'workerEntrypoint']));
}

function transform(code: string, ctx: TransformContext) {
  const result = applyAutoInstrumentTransforms(code, parseJS(code), ctx);
  // Rewriting whole statements (rather than only splicing in wrappers) makes it possible to emit
  // syntactically broken output, which would surface as an opaque bundler error.
  if (result) parseJS(result.code);
  return result;
}

// ---------------------------------------------------------------------------
// Default export wrapping
// ---------------------------------------------------------------------------

describe('default export wrapping', () => {
  const ctx: TransformContext = { classWrappers: doWrappers(), optionsFn: '(env) => ({})' };

  it('wraps an object-literal default export', () => {
    const code = [
      'const handler = {',
      '  fetch() { return new Response("ok"); }',
      '};',
      'export default handler;',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain("import * as __SENTRY__ from '@sentry/cloudflare'");
    expect(result.code).toContain('var __SENTRY_DEFAULT_EXPORT__ = handler');
    expect(result.code).toContain('__SENTRY__.withSentry((env) => ({}), __SENTRY_DEFAULT_EXPORT__)');
    expect(result.code).not.toContain('export default handler');
    expect(result.map).toBeDefined();
  });

  it('wraps an inline object default export', () => {
    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('var __SENTRY_DEFAULT_EXPORT__ =');
    expect(result.code).toContain('__SENTRY__.withSentry(');
  });

  it('wraps a class default export', () => {
    const code = [
      'class Worker {',
      '  fetch(request) { return new Response("ok"); }',
      '}',
      'export default Worker;',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('__SENTRY__.withSentry(');
  });

  it('wraps a local binding exported as default by a specifier', () => {
    const code = ['var server_default = { fetch: handle };', 'export { server_default as default };'].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'var server_default = { fetch: handle };',
        'var __SENTRY_DEFAULT_EXPORT__ = server_default;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), server_default);',
      ].join('\n'),
    );
  });

  it('binds the default export after a local declared below the export', () => {
    const code = ['export { handler as default };', 'const handler = { fetch() {} };'].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        'const handler = { fetch() {} };',
        'var __SENTRY_DEFAULT_EXPORT__ = handler;',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), handler);',
      ].join('\n'),
    );
  });

  it('binds the default export after a function declaration', () => {
    const code = ['function handler() {}', 'export { handler as default };'].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'function handler() {}',
        'var __SENTRY_DEFAULT_EXPORT__ = handler;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), handler);',
      ].join('\n'),
    );
  });

  it('binds the default export after the import of an imported local', () => {
    const code = ["import handler from './handler';", 'export { handler as default };'].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import handler from './handler';",
        'var __SENTRY_DEFAULT_EXPORT__ = handler;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), handler);',
      ].join('\n'),
    );
  });

  it('keeps the default export readable from a circular import during module evaluation', () => {
    // `b` reads the entry's default export while the entry is still evaluating, as bundled code can.
    const entry = [
      "import { readDefault } from './b.mjs';",
      'var server_default = { fetch() {} };',
      'console.log(readDefault());',
      'export { server_default as default };',
    ].join('\n');
    const transformed = transform(entry, ctx)!.code.replace(
      "import * as __SENTRY__ from '@sentry/cloudflare';",
      'const __SENTRY__ = { withSentry: (_options, handler) => handler };',
    );

    const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-cycle-'));
    try {
      writeFileSync(join(dir, 'a.mjs'), transformed);
      writeFileSync(
        join(dir, 'b.mjs'),
        "import handler from './a.mjs';\nexport function readDefault() { return typeof handler.fetch; }\n",
      );
      // Plain Node: Vitest's module runner does not evaluate import cycles like native ESM does.
      expect(execFileSync(process.execPath, [join(dir, 'a.mjs')], { encoding: 'utf8' }).trim()).toBe('function');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Runs `a.mjs` transformed, under plain Node, with a `withSentry` stub that marks each method it
   * finds as instrumented, and returns what `main.mjs` prints.
   */
  function runInstrumented(entry: string): string {
    const transformed = transform(entry, ctx)!.code.replace(
      "import * as __SENTRY__ from '@sentry/cloudflare';",
      'const __SENTRY__ = { withSentry: (_options, handler) => { for (const key of Object.keys(handler)) handler[key].instrumented = true; return handler; } };',
    );
    const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-late-'));
    try {
      writeFileSync(join(dir, 'a.mjs'), transformed);
      writeFileSync(
        join(dir, 'main.mjs'),
        "import handler from './a.mjs';\nconsole.log(String(handler?.fetch?.instrumented));\n",
      );
      return execFileSync(process.execPath, [join(dir, 'main.mjs')], { encoding: 'utf8' }).trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('wraps a default export assigned after its declaration', () => {
    const entry = ['let handler;', 'handler = { fetch() {} };', 'export { handler as default };'].join('\n');
    expect(runInstrumented(entry)).toBe('true');
  });

  it('wraps a method added to the default export after its declaration', () => {
    const entry = ['const handler = {};', 'handler.fetch = function () {};', 'export { handler as default };'].join(
      '\n',
    );
    expect(runInstrumented(entry)).toBe('true');
  });

  it('leaves sibling specifiers of a default specifier export untouched', () => {
    const code = [
      'const helper = 1;',
      'const handler = { fetch() {} };',
      'export { helper, handler as default };',
    ].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'const helper = 1;',
        'const handler = { fetch() {} };',
        'var __SENTRY_DEFAULT_EXPORT__ = handler;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        'export { helper };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), handler);',
      ].join('\n'),
    );
  });

  it('skips a hand-wrapped `export const` exported as default by a specifier', () => {
    const code = [
      "import { withSentry } from '@sentry/cloudflare';",
      'export const handler = withSentry((env) => ({}), { fetch() {} });',
      'export { handler as default };',
    ].join('\n');
    expect(transform(code, ctx)).toBeUndefined();
  });

  it('skips a hand-wrapped local exported as default by a specifier', () => {
    const code = [
      "import { withSentry } from '@sentry/cloudflare';",
      'const handler = withSentry((env) => ({}), { fetch() {} });',
      'export { handler as default };',
    ].join('\n');
    expect(transform(code, ctx)).toBeUndefined();
  });

  it('wraps a default re-export from another module', () => {
    const code = "export { default } from './handler';";

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import __SENTRY_REEXPORT_default__ from './handler';",
        'var __SENTRY_DEFAULT_EXPORT__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.withSentry, (env) => ({}), __SENTRY_REEXPORT_default__);',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
      ].join('\n'),
    );
  });

  it('wraps a named export of another module re-exported as default', () => {
    const code = "export { handler as default } from './handler';";

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { handler as __SENTRY_REEXPORT_default__ } from './handler';",
        'var __SENTRY_DEFAULT_EXPORT__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.withSentry, (env) => ({}), __SENTRY_REEXPORT_default__);',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
      ].join('\n'),
    );
  });

  it('does not throw when a circular import reads a default re-export during module evaluation', () => {
    // `b` reads the entry's default export after `./handler.mjs` has run but before the entry has.
    const entry = [
      "export { default } from './handler.mjs';",
      "import { readDefault } from './b.mjs';",
      'console.log(readDefault());',
    ].join('\n');
    const transformed = transform(entry, ctx)!.code.replace(
      "import * as __SENTRY__ from '@sentry/cloudflare';",
      'const __SENTRY__ = { withSentry: (_options, handler) => handler, _INTERNAL_wrapUnlessInstrumented: (wrap, options, handler) => wrap(options, handler) };',
    );

    const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-cycle-'));
    try {
      writeFileSync(join(dir, 'a.mjs'), transformed);
      writeFileSync(join(dir, 'handler.mjs'), 'export default { fetch() {} };\n');
      writeFileSync(
        join(dir, 'b.mjs'),
        "import handler from './a.mjs';\nconst kind = typeof handler;\nexport function readDefault() { return kind; }\n",
      );
      // Plain Node: Vitest's module runner does not evaluate import cycles like native ESM does.
      expect(execFileSync(process.execPath, [join(dir, 'a.mjs')], { encoding: 'utf8' }).trim()).toBe('undefined');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves sibling specifiers of a default re-export untouched', () => {
    const code = "export { default, helper } from './handler';";

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import __SENTRY_REEXPORT_default__ from './handler';",
        'var __SENTRY_DEFAULT_EXPORT__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.withSentry, (env) => ({}), __SENTRY_REEXPORT_default__);',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        "export { helper } from './handler';",
      ].join('\n'),
    );
  });

  it('uses custom options callback', () => {
    const custom: TransformContext = {
      classWrappers: doWrappers(),
      optionsFn: '(env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 1.0 })',
    };

    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = transform(code, custom)!;
    expect(result.code).toContain('dsn: env.SENTRY_DSN');
    expect(result.code).toContain('tracesSampleRate: 1.0');
  });

  /**
   * Writes `files` to a temp dir, with `a.mjs` transformed and `withSentry` stubbed to mark each
   * method it finds as instrumented, and returns what `node <entry>` prints.
   */
  function runWithEntry(files: Record<string, string>, entry: string, transformEntry = true): string {
    const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-default-'));
    try {
      for (const [name, code] of Object.entries(files)) {
        const out =
          name === 'a.mjs' && transformEntry
            ? transform(code, ctx)!.code.replace(
                "import * as __SENTRY__ from '@sentry/cloudflare';",
                'const __SENTRY__ = { withSentry: (_options, handler) => { for (const key of Object.keys(handler)) handler[key].instrumented = true; return handler; } };',
              )
            : code;
        writeFileSync(join(dir, name), out);
      }
      return execFileSync(process.execPath, [join(dir, entry)], { encoding: 'utf8' }).trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it.each([
    'export default class { fetch() {} }',
    'export default function () {}',
    'export default () => {};',
    'export default (class { fetch() {} });',
    'export default class Handler { fetch() {} }',
    'export default function handler() {}',
  ])('keeps the name of the default export of `%s`', code => {
    const files = { 'a.mjs': code, 'b.mjs': "import handler from './a.mjs';\nconsole.log(handler.name);" };
    expect(runWithEntry(files, 'b.mjs')).toBe(runWithEntry(files, 'b.mjs', false));
  });

  it('wraps a parenthesized default export', () => {
    const code = ['const handler = { fetch() {} };', 'export default (handler);'].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'const handler = { fetch() {} };',
        'var __SENTRY_DEFAULT_EXPORT__ = (handler);',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), __SENTRY_DEFAULT_EXPORT__);',
      ].join('\n'),
    );
  });

  it('wraps a default export with a comment that mentions `default`', () => {
    const code = 'export /* the default */ default /* default handler */ { fetch() {} };';

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'var __SENTRY_DEFAULT_EXPORT__ = /* default handler */ { fetch() {} };',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), __SENTRY_DEFAULT_EXPORT__);',
      ].join('\n'),
    );
  });

  it('wraps a default export with a line comment that mentions `default`', () => {
    const code = ['export // the default', 'default // default handler', '{ fetch() {} };'].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'var __SENTRY_DEFAULT_EXPORT__ = // default handler',
        '{ fetch() {} };',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), __SENTRY_DEFAULT_EXPORT__);',
      ].join('\n'),
    );
  });

  it('keeps the module binding of a named default class', () => {
    const code = ['export default class Handler { fetch() {} }', 'Handler.ready = true;'].join('\n');

    expect(transform(code, ctx)!.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        'class Handler { fetch() {} }',
        'var __SENTRY_DEFAULT_EXPORT__ = Handler;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        'Handler.ready = true;',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({}), Handler);',
      ].join('\n'),
    );
  });

  it('wraps a method added to the default export after `export default`', () => {
    const files = {
      'a.mjs': ['const handler = {};', 'export default handler;', 'handler.fetch = function () {};'].join('\n'),
      'main.mjs': "import handler from './a.mjs';\nconsole.log(String(handler.fetch.instrumented));",
    };

    expect(runWithEntry(files, 'main.mjs')).toBe('true');
  });

  it('sets the default export where the original statement set it', () => {
    // `b` reads the default export of `a` while `a` is still evaluating, after its `export default`.
    const files = {
      'a.mjs': [
        "import { readDefault } from './b.mjs';",
        'export default { fetch() {} };',
        'export const seen = readDefault();',
      ].join('\n'),
      'b.mjs': "import handler from './a.mjs';\nexport function readDefault() { return typeof handler.fetch; }",
      'main.mjs': "import { seen } from './a.mjs';\nconsole.log(seen);",
    };

    expect(runWithEntry(files, 'main.mjs')).toBe('function');
  });

  it('skips when already wrapped with withSentry', () => {
    const code = [
      "import { withSentry } from '@sentry/cloudflare';",
      'export default withSentry((env) => ({}), { fetch() {} });',
    ].join('\n');
    expect(transform(code, ctx)).toBeUndefined();
  });

  it('skips when already wrapped with Sentry.withSentry', () => {
    const code = [
      "import * as Sentry from '@sentry/cloudflare';",
      'export default Sentry.withSentry((env) => ({}), { fetch() {} });',
    ].join('\n');
    expect(transform(code, ctx)).toBeUndefined();
  });

  it('generates a source map', () => {
    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = transform(code, ctx)!;
    expect(result.map).toBeDefined();
    expect(result.map.mappings).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Durable Object class wrapping
// ---------------------------------------------------------------------------

describe('Durable Object class wrapping', () => {
  const ctx: TransformContext = {
    classWrappers: doWrappers('MyDurableObject'),
    optionsFn: '(env) => ({})',
  };

  it('wraps an exported DO class', () => {
    const code = [
      'class DurableObject {}',
      'export class MyDurableObject extends DurableObject {',
      '  fetch(request) { return new Response("DO ok"); }',
      '}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();

    expect(result.code).toContain('class MyDurableObject extends DurableObject {');
    expect(result.code).not.toContain('export class MyDurableObject');
    expect(result.code).toContain(
      'const __SENTRY_WRAPPED_MyDurableObject__ = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({}), MyDurableObject);',
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };');
  });

  // The wrapper must not touch the declaration: `Function.prototype.name` is what libraries read to
  // identify the user's class (`@cloudflare/think` passes `this.constructor.name` to the AI SDK as the
  // telemetry `functionId`, which becomes the `gen_ai.invoke_agent` span name), and a user-chosen
  // `static name` has to keep winning too.
  it('leaves the class declaration untouched and aliases the export instead', () => {
    const code = [
      'class DurableObject {}',
      'export class MyDurableObject extends DurableObject { static name = "user-chosen"; }',
    ].join('\n');

    const result = transform(code, ctx)!;

    expect(result.code).toContain('class MyDurableObject extends DurableObject { static name = "user-chosen"; }');
    expect(result.code).not.toContain('__SENTRY_ORIGINAL_');
    expect(result.code).not.toContain('Object.defineProperty');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };');
  });

  it('shares one wrapper between two exports of the same local class', () => {
    const code = [
      'class DurableObject {}',
      'class MyDurableObject extends DurableObject {}',
      'export { MyDurableObject };',
      'export { MyDurableObject as Alias };',
    ].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyDurableObject', 'Alias'),
      optionsFn: '(env) => ({})',
    })!;

    const wrapCount = (result.code.match(/instrumentDurableObjectWithSentry\(/g) ?? []).length;
    expect(wrapCount).toBe(1);
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDurableObject__ as Alias };');
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject', 'Alias']));
  });

  it('wraps multiple DO classes', () => {
    const multi: TransformContext = {
      classWrappers: doWrappers('DOA', 'DOB'),
      optionsFn: '(env) => ({})',
    };

    const code = [
      'class DurableObject {}',
      'export class DOA extends DurableObject {}',
      'export class DOB extends DurableObject {}',
    ].join('\n');

    const result = transform(code, multi)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('export { __SENTRY_WRAPPED_DOA__ as DOA };');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_DOB__ as DOB };');
    expect(result.code).toContain('class DOA extends DurableObject');
    expect(result.code).toContain('class DOB extends DurableObject');
  });

  it('ignores classes not listed in wrangler config', () => {
    const code = ['class DurableObject {}', 'export class SomeOtherClass extends DurableObject {}'].join('\n');

    expect(transform(code, ctx)).toBeUndefined();
  });

  it('ignores non-class named exports', () => {
    const code = 'export const MyDurableObject = 42;';
    expect(transform(code, ctx)).toBeUndefined();
  });

  it('wraps a DO class exported via a specifier list', () => {
    const code = [
      'class DurableObject {}',
      'class MyDurableObject extends DurableObject {',
      '  fetch(request) { return new Response("DO ok"); }',
      '}',
      'export { MyDurableObject };',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('class MyDurableObject extends DurableObject {');
    expect(result.code).toContain(
      'const __SENTRY_WRAPPED_MyDurableObject__ = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({}), MyDurableObject);',
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };');
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
  });

  it('wraps a DO class exported via an aliased specifier', () => {
    const code = [
      'class DurableObject {}',
      'class Internal extends DurableObject {}',
      'export { Internal as MyDurableObject };',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('class Internal extends DurableObject {}');
    expect(result.code).toContain(
      'const __SENTRY_WRAPPED_Internal__ = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({}), Internal);',
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_Internal__ as MyDurableObject };');
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
  });

  it('wraps a DO class imported from another module and exported by specifier', () => {
    const code = ["import { MyDurableObject } from './do';", 'export { MyDurableObject };'].join('\n');

    const result = transform(code, ctx)!;
    // The import binding cannot be reassigned, so the export is re-pointed at a wrapper binding.
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { MyDurableObject } from './do';",
        'const __SENTRY_WRAPPED_MyDurableObject__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentDurableObjectWithSentry, (env) => ({}), MyDurableObject);',
        'export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };',
      ].join('\n'),
    );
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
  });

  it('wraps a DO class re-exported straight from another module', () => {
    const code = "export { MyDurableObject } from './do';";

    const result = transform(code, ctx)!;
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { MyDurableObject as __SENTRY_REEXPORT_MyDurableObject__ } from './do';",
        'const __SENTRY_WRAPPED_MyDurableObject__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentDurableObjectWithSentry, (env) => ({}), __SENTRY_REEXPORT_MyDurableObject__);',
        'export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };',
      ].join('\n'),
    );
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
  });

  it('wraps an aliased re-export from another module', () => {
    const code = "export { Internal as MyDurableObject } from './do';";

    const result = transform(code, ctx)!;
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { Internal as __SENTRY_REEXPORT_MyDurableObject__ } from './do';",
        'const __SENTRY_WRAPPED_MyDurableObject__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentDurableObjectWithSentry, (env) => ({}), __SENTRY_REEXPORT_MyDurableObject__);',
        'export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };',
      ].join('\n'),
    );
  });

  it('wraps a default re-export from another module', () => {
    const code = "export { default as MyDurableObject } from './do';";

    const result = transform(code, ctx)!;
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import __SENTRY_REEXPORT_MyDurableObject__ from './do';",
        'const __SENTRY_WRAPPED_MyDurableObject__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentDurableObjectWithSentry, (env) => ({}), __SENTRY_REEXPORT_MyDurableObject__);',
        'export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };',
      ].join('\n'),
    );
  });

  it('leaves sibling specifiers of a re-export statement untouched', () => {
    const code = "export { Helper, MyDurableObject, other as Other } from './do';";

    const result = transform(code, ctx)!;
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { MyDurableObject as __SENTRY_REEXPORT_MyDurableObject__ } from './do';",
        'const __SENTRY_WRAPPED_MyDurableObject__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentDurableObjectWithSentry, (env) => ({}), __SENTRY_REEXPORT_MyDurableObject__);',
        'export { __SENTRY_WRAPPED_MyDurableObject__ as MyDurableObject };',
        "export { Helper, other as Other } from './do';",
      ].join('\n'),
    );
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
  });

  it('wraps a mix of local and imported classes in one export statement', () => {
    const mixed: TransformContext = { classWrappers: doWrappers('LocalDO', 'ImportedDO'), optionsFn: '(env) => ({})' };
    const code = [
      "import { ImportedDO } from './do';",
      'class DurableObject {}',
      'class LocalDO extends DurableObject {}',
      'const unrelated = 1;',
      'export { LocalDO, ImportedDO, unrelated };',
    ].join('\n');

    const result = transform(code, mixed)!;
    // Both classes export through a wrapper binding; only the unrelated specifier is carried over.
    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { ImportedDO } from './do';",
        'class DurableObject {}',
        'class LocalDO extends DurableObject {}',
        'const __SENTRY_WRAPPED_LocalDO__ = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({}), LocalDO);',
        '',
        'const unrelated = 1;',
        'const __SENTRY_WRAPPED_ImportedDO__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentDurableObjectWithSentry, (env) => ({}), ImportedDO);',
        'export { __SENTRY_WRAPPED_LocalDO__ as LocalDO, __SENTRY_WRAPPED_ImportedDO__ as ImportedDO };',
        'export { unrelated };',
      ].join('\n'),
    );
    expect(result.wrappedClasses).toEqual(new Set(['LocalDO', 'ImportedDO']));
  });

  it('counts a locally hand-wrapped class exported by specifier as wrapped', () => {
    const code = [
      "import { instrumentDurableObjectWithSentry } from '@sentry/cloudflare';",
      "import { Impl } from './do';",
      'const MyDurableObject = instrumentDurableObjectWithSentry((env) => ({}), Impl);',
      'export { MyDurableObject };',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
    expect(result.code).toBe(code);
  });

  it('reports wrapped DO classes for the inline export form', () => {
    const code = ['class DurableObject {}', 'export class MyDurableObject extends DurableObject {}'].join('\n');
    const result = transform(code, ctx)!;
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
  });

  it('counts a manually wrapped DO export as wrapped without touching it', () => {
    const code = [
      "import { instrumentDurableObjectWithSentry } from '@sentry/cloudflare';",
      'class Impl {}',
      'export const MyDurableObject = instrumentDurableObjectWithSentry((env) => ({}), Impl);',
    ].join('\n');

    // The DO is configured, so its manual wrapping is reported (letting the
    // plugin skip the "could not auto-instrument" warning) but the code is left
    // untouched — no rewrite, no injected `@sentry/cloudflare` import.
    const result = transform(code, { classWrappers: doWrappers('MyDurableObject'), optionsFn: '(env) => ({})' })!;
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
    expect(result.code).toBe(code);
    expect(result.code).not.toContain('__SENTRY_WRAPPED_');
    expect(result.code).not.toContain("import * as __SENTRY__ from '@sentry/cloudflare'");
  });

  it('returns undefined when nothing is wrapped and no DO classes are configured', () => {
    const code = [
      "import { withSentry } from '@sentry/cloudflare';",
      'export default withSentry((env) => ({}), { fetch() {} });',
    ].join('\n');

    expect(transform(code, ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Workflow class wrapping
// ---------------------------------------------------------------------------

describe('Workflow class wrapping', () => {
  const ctx: TransformContext = {
    classWrappers: workflowWrappers('MyWorkflow'),
    optionsFn: '(env) => ({})',
  };

  it('wraps an exported workflow class with instrumentWorkflowWithSentry', () => {
    const code = [
      'class WorkflowEntrypoint {}',
      'export class MyWorkflow extends WorkflowEntrypoint {',
      '  async run(event, step) {}',
      '}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('class MyWorkflow extends WorkflowEntrypoint {');
    expect(result.code).not.toContain('export class MyWorkflow');
    expect(result.code).toContain('const __SENTRY_WRAPPED_MyWorkflow__ = __SENTRY__.instrumentWorkflowWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyWorkflow__ as MyWorkflow };');
    // A workflow must never be wrapped with the DO helper.
    expect(result.code).not.toContain('instrumentDurableObjectWithSentry');
    expect(result.wrappedClasses).toEqual(new Set(['MyWorkflow']));
  });

  it('wraps a workflow class exported via a specifier', () => {
    const code = [
      'class WorkflowEntrypoint {}',
      'class MyWorkflow extends WorkflowEntrypoint {}',
      'export { MyWorkflow };',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain(
      'const __SENTRY_WRAPPED_MyWorkflow__ = __SENTRY__.instrumentWorkflowWithSentry((env) => ({}), MyWorkflow);',
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyWorkflow__ as MyWorkflow };');
    expect(result.wrappedClasses).toEqual(new Set(['MyWorkflow']));
  });

  it('wraps a workflow class re-exported from another module', () => {
    const code = "export { MyWorkflow } from './workflow';";

    const result = transform(code, ctx)!;
    expect(result.code).toContain("import { MyWorkflow as __SENTRY_REEXPORT_MyWorkflow__ } from './workflow';");
    expect(result.code).toContain(
      'const __SENTRY_WRAPPED_MyWorkflow__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentWorkflowWithSentry, (env) => ({}), __SENTRY_REEXPORT_MyWorkflow__);',
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyWorkflow__ as MyWorkflow };');
    expect(result.code).not.toContain('instrumentDurableObjectWithSentry');
  });

  it('counts a manually wrapped workflow export as wrapped without touching it', () => {
    const code = [
      "import { instrumentWorkflowWithSentry } from '@sentry/cloudflare';",
      'class Impl {}',
      'export const MyWorkflow = instrumentWorkflowWithSentry((env) => ({}), Impl);',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.wrappedClasses).toEqual(new Set(['MyWorkflow']));
    expect(result.code).toBe(code);
  });

  it('ignores workflow classes not listed in wrangler config', () => {
    const code = ['class WorkflowEntrypoint {}', 'export class SomeOtherWorkflow extends WorkflowEntrypoint {}'].join(
      '\n',
    );
    expect(transform(code, ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WorkerEntrypoint class wrapping (structural detection)
//
// A worker's own entrypoints aren't listed in its wrangler config, so these are
// detected by their `extends WorkerEntrypoint` clause (the identifier imported
// from `cloudflare:workers`) rather than by a config entry.
// ---------------------------------------------------------------------------

describe('WorkerEntrypoint class wrapping (structural)', () => {
  // No config entry — detection is purely structural.
  const ctx: TransformContext = { classWrappers: new Map(), optionsFn: '(env) => ({})' };

  it('wraps a directly-exported class extending the imported WorkerEntrypoint', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'export class AdminEntry extends WorkerEntrypoint {',
      '  fetch(request) { return new Response("admin"); }',
      '}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('class AdminEntry extends WorkerEntrypoint {');
    expect(result.code).not.toContain('export class AdminEntry');
    expect(result.code).toContain('const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__.withSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
    expect(result.wrappedClasses).toEqual(new Set(['AdminEntry']));
  });

  it.each([
    ['after', ['export class AdminEntry extends WorkerEntrypoint {}', 'export { AdminEntry as default };']],
    ['before', ['export { AdminEntry as default };', 'export class AdminEntry extends WorkerEntrypoint {}']],
  ])('shares one wrapper between `export class` and a default specifier %s it', (_order, lines) => {
    const code = ["import { WorkerEntrypoint } from 'cloudflare:workers';", ...lines].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code.match(/withSentry\(/g)).toHaveLength(1);
    // The wrapper follows the class, so it never reads the class before it is set.
    expect(result.code.indexOf('const __SENTRY_WRAPPED_AdminEntry__')).toBeGreaterThan(
      result.code.indexOf('class AdminEntry extends WorkerEntrypoint {}'),
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as default };');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
  });

  it('wraps a class extending an aliased WorkerEntrypoint import', () => {
    const code = [
      "import { WorkerEntrypoint as WE } from 'cloudflare:workers';",
      'export class AdminEntry extends WE {}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain('const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__.withSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
  });

  it('wraps a class extending a namespace-imported WorkerEntrypoint', () => {
    const code = [
      "import * as cf from 'cloudflare:workers';",
      'export class AdminEntry extends cf.WorkerEntrypoint {}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain('const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__.withSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
  });

  it('wraps a class via an indirect same-file base chain', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class Base extends WorkerEntrypoint {}',
      'export class AdminEntry extends Base {}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain('const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__.withSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
    expect(result.wrappedClasses).toEqual(new Set(['AdminEntry']));
  });

  it('wraps an entrypoint exported via a specifier', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class AdminEntry extends WorkerEntrypoint {}',
      'export { AdminEntry };',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain(
      'const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__.withSentry((env) => ({}), AdminEntry);',
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
    expect(result.wrappedClasses).toEqual(new Set(['AdminEntry']));
  });

  it('does not wrap a class extending a same-named local class (not the import)', () => {
    // `WorkerEntrypoint` here is a local class, not the `cloudflare:workers`
    // import, so it must not be mistaken for an entrypoint.
    const code = ['class WorkerEntrypoint {}', 'export class NotAnEntry extends WorkerEntrypoint {}'].join('\n');
    expect(transform(code, ctx)).toBeUndefined();
  });

  it('does not wrap a non-exported entrypoint class', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class Unexported extends WorkerEntrypoint {}',
    ].join('\n');
    expect(transform(code, ctx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WorkerEntrypoint class wrapping (config self-binding fallback)
//
// When the base class lives in another module, structural detection can't see
// it; a self-bound service entrypoint in the config supplies the name instead.
// ---------------------------------------------------------------------------

describe('WorkerEntrypoint class wrapping (config fallback)', () => {
  const ctx: TransformContext = {
    classWrappers: entrypointWrappers('AdminEntry'),
    optionsFn: '(env) => ({})',
  };

  it('wraps a configured entrypoint whose base class is imported from another module', () => {
    const code = ["import { BaseEntry } from './base';", 'export class AdminEntry extends BaseEntry {}'].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain('const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__.withSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
    expect(result.wrappedClasses).toEqual(new Set(['AdminEntry']));
  });

  it('wraps a configured entrypoint re-exported from another module', () => {
    const code = "export { AdminEntry } from './admin';";

    const result = transform(code, ctx)!;
    expect(result.code).toContain("import { AdminEntry as __SENTRY_REEXPORT_AdminEntry__ } from './admin';");
    expect(result.code).toContain(
      'const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.withSentry, (env) => ({}), __SENTRY_REEXPORT_AdminEntry__);',
    );
    expect(result.code).toContain('export { __SENTRY_WRAPPED_AdminEntry__ as AdminEntry };');
  });

  it('ignores an entrypoint that is neither structurally detected nor configured', () => {
    const other: TransformContext = { classWrappers: new Map(), optionsFn: '(env) => ({})' };
    const code = ["import { BaseEntry } from './base';", 'export class AdminEntry extends BaseEntry {}'].join('\n');
    expect(transform(code, other)).toBeUndefined();
  });

  // Structural detection reads the entry's own AST, so it can only ever name a class declared
  // there — an unconfigured re-export has no base chain to inspect and must be left alone.
  it('does not wrap a re-export that is only structurally detectable', () => {
    const other: TransformContext = { classWrappers: new Map(), optionsFn: '(env) => ({})' };
    const code = "export { AdminEntry } from './admin';";
    expect(transform(code, other)).toBeUndefined();
  });

  // In `export { X } from '...'` the specifier's "local" name belongs to the *source* module, so it
  // must never be matched against classes detected in this one — they are unrelated bindings that
  // merely share a name.
  it('does not wrap a re-export whose source name collides with a local entrypoint class', () => {
    const other: TransformContext = { classWrappers: new Map(), optionsFn: '(env) => ({})' };
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class AdminEntry extends WorkerEntrypoint {}',
      "export { AdminEntry } from './admin';",
    ].join('\n');

    expect(transform(code, other)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Agent classes (configured as Durable Objects, upgraded by detection)
// ---------------------------------------------------------------------------

describe('agent class wrapping', () => {
  it('wraps a detected Agent with instrumentAgentWithSentry instead of the DO helper', () => {
    const code = ["import { Agent } from 'agents';", 'export class MyAgent extends Agent {}'].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyAgent'),
      agentClasses: new Set(['MyAgent']),
      optionsFn: '(env) => ({})',
    })!;

    expect(result.code).toContain('const __SENTRY_WRAPPED_MyAgent__ = __SENTRY__.instrumentAgentWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyAgent__ as MyAgent };');
    expect(result.code).not.toContain('instrumentDurableObjectWithSentry');
    expect(result.wrappedClasses).toEqual(new Set(['MyAgent']));
  });

  it('still wraps an undetected DO with the Durable Object helper', () => {
    const code = ["import { DurableObject } from 'cloudflare:workers';", 'export class MyDO extends DurableObject {}'];

    const result = transform(code.join('\n'), {
      classWrappers: doWrappers('MyDO'),
      agentClasses: new Set(),
      optionsFn: '(env) => ({})',
    })!;

    expect(result.code).toContain('const __SENTRY_WRAPPED_MyDO__ = __SENTRY__.instrumentDurableObjectWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDO__ as MyDO };');
    expect(result.code).not.toContain('instrumentAgentWithSentry');
  });

  it('wraps an Agent and a plain DO in the same entry with their respective helpers', () => {
    const code = [
      "import { Agent } from 'agents';",
      "import { DurableObject } from 'cloudflare:workers';",
      'export class MyAgent extends Agent {}',
      'export class MyDO extends DurableObject {}',
    ].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyAgent', 'MyDO'),
      agentClasses: new Set(['MyAgent']),
      optionsFn: '(env) => ({})',
    })!;

    expect(result.code).toContain('const __SENTRY_WRAPPED_MyAgent__ = __SENTRY__.instrumentAgentWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyAgent__ as MyAgent };');
    expect(result.code).toContain('const __SENTRY_WRAPPED_MyDO__ = __SENTRY__.instrumentDurableObjectWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDO__ as MyDO };');
  });

  it('emits the expected source for a mixed Agent/chat-agent/DO entry', () => {
    const code = [
      "import { Agent } from 'agents';",
      "import { AIChatAgent } from '@cloudflare/ai-chat';",
      "import { DurableObject } from 'cloudflare:workers';",
      'export class MyAgent extends Agent {}',
      'export class MyChat extends AIChatAgent {}',
      'export class MyDO extends DurableObject {}',
      'export default { fetch() {} };',
    ].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyAgent', 'MyChat', 'MyDO'),
      agentClasses: new Set(['MyAgent', 'MyChat']),
      optionsFn: '(env) => ({ dsn: env.SENTRY_DSN })',
    })!;

    expect(result.code).toBe(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import { Agent } from 'agents';",
        "import { AIChatAgent } from '@cloudflare/ai-chat';",
        "import { DurableObject } from 'cloudflare:workers';",
        'class MyAgent extends Agent {}',
        'const __SENTRY_WRAPPED_MyAgent__ = __SENTRY__.instrumentAgentWithSentry((env) => ({ dsn: env.SENTRY_DSN }), MyAgent);',
        'export { __SENTRY_WRAPPED_MyAgent__ as MyAgent };',
        '',
        'class MyChat extends AIChatAgent {}',
        'const __SENTRY_WRAPPED_MyChat__ = __SENTRY__.instrumentAgentWithSentry((env) => ({ dsn: env.SENTRY_DSN }), MyChat);',
        'export { __SENTRY_WRAPPED_MyChat__ as MyChat };',
        '',
        'class MyDO extends DurableObject {}',
        'const __SENTRY_WRAPPED_MyDO__ = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({ dsn: env.SENTRY_DSN }), MyDO);',
        'export { __SENTRY_WRAPPED_MyDO__ as MyDO };',
        '',
        'var __SENTRY_DEFAULT_EXPORT__ = { fetch() {} };',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry((env) => ({ dsn: env.SENTRY_DSN }), __SENTRY_DEFAULT_EXPORT__);',
      ].join('\n'),
    );
  });

  it('upgrades a specifier-exported Agent, matching detection on the local name', () => {
    const code = [
      "import { Agent } from 'agents';",
      'class LocalAgent extends Agent {}',
      'export { LocalAgent as ConfiguredAgent };',
    ].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('ConfiguredAgent'),
      agentClasses: new Set(['LocalAgent']),
      optionsFn: '(env) => ({})',
    })!;

    expect(result.code).toContain('const __SENTRY_WRAPPED_LocalAgent__ = __SENTRY__.instrumentAgentWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_LocalAgent__ as ConfiguredAgent };');
  });

  it('does not report a manually Agent-wrapped export as unwrapped', () => {
    const code = [
      "import * as Sentry from '@sentry/cloudflare';",
      "import { Agent } from 'agents';",
      'class MyAgentBase extends Agent {}',
      'export const MyAgent = Sentry.instrumentAgentWithSentry((env) => ({}), MyAgentBase);',
    ].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyAgent'),
      agentClasses: new Set(),
      optionsFn: '(env) => ({})',
    })!;

    expect(result.wrappedClasses).toEqual(new Set(['MyAgent']));
  });

  it('leaves the DO helper accepted for a manually wrapped Durable Object', () => {
    const code = [
      "import * as Sentry from '@sentry/cloudflare';",
      'export const MyDO = Sentry.instrumentDurableObjectWithSentry((env) => ({}), class {});',
    ].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyDO'),
      optionsFn: '(env) => ({})',
    })!;

    expect(result.wrappedClasses).toEqual(new Set(['MyDO']));
  });
});

// ---------------------------------------------------------------------------
// Combined transforms (DO + Workflow + default export)
// ---------------------------------------------------------------------------

describe('combined transforms', () => {
  const ctx: TransformContext = {
    classWrappers: doWrappers('MyDO'),
    optionsFn: '(env) => ({ dsn: env.SENTRY_DSN })',
  };

  it('wraps a DO and a Workflow with their respective helpers', () => {
    const mixed: TransformContext = {
      classWrappers: new Map<string, ClassWrapperKind>([
        ['MyDO', 'durableObject'],
        ['MyWorkflow', 'workflow'],
      ]),
      optionsFn: '(env) => ({})',
    };

    const code = [
      'class DurableObject {}',
      'class WorkflowEntrypoint {}',
      'export class MyDO extends DurableObject {}',
      'export class MyWorkflow extends WorkflowEntrypoint {}',
    ].join('\n');

    const result = transform(code, mixed)!;
    expect(result.code).toContain('const __SENTRY_WRAPPED_MyDO__ = __SENTRY__.instrumentDurableObjectWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDO__ as MyDO };');
    expect(result.code).toContain('const __SENTRY_WRAPPED_MyWorkflow__ = __SENTRY__.instrumentWorkflowWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyWorkflow__ as MyWorkflow };');
    expect(result.wrappedClasses).toEqual(new Set(['MyDO', 'MyWorkflow']));
    const importCount = (result.code.match(/import \* as __SENTRY__/g) ?? []).length;
    expect(importCount).toBe(1);
  });

  it('wraps both DO class and default export', () => {
    const code = [
      'class DurableObject {}',
      'export class MyDO extends DurableObject {',
      '  fetch(r) { return new Response("do"); }',
      '}',
      'export default {',
      '  fetch(r) { return new Response("main"); }',
      '};',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();

    // DO wrapped
    expect(result.code).toContain('class MyDO extends DurableObject {');
    expect(result.code).toContain('const __SENTRY_WRAPPED_MyDO__ = __SENTRY__.instrumentDurableObjectWithSentry(');
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDO__ as MyDO };');

    // Default export wrapped
    expect(result.code).toContain('var __SENTRY_DEFAULT_EXPORT__ =');
    expect(result.code).toContain('__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry(');

    // Single import
    const importCount = (result.code.match(/import \* as __SENTRY__/g) ?? []).length;
    expect(importCount).toBe(1);
  });

  it('does not double-wrap a class exported both by name and as default', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class AdminEntry extends WorkerEntrypoint {}',
      'export { AdminEntry };',
      'export default AdminEntry;',
    ].join('\n');

    const result = transform(code, { classWrappers: new Map(), optionsFn: '(env) => ({})' })!;

    // The named export wraps it once; the default re-export must not wrap again.
    const wrapCount = (result.code.match(/withSentry\(/g) ?? []).length;
    expect(wrapCount).toBe(1);
    expect(result.code).toContain('const __SENTRY_WRAPPED_AdminEntry__ = __SENTRY__.withSentry(');
    expect(result.code).not.toContain('__SENTRY_DEFAULT_EXPORT__');
    // The default export is re-pointed at the (single-)wrapped binding.
    expect(result.code).toContain('export default __SENTRY_WRAPPED_AdminEntry__;');
  });

  it('handles the default export appearing before its named wrap in source order', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class AdminEntry extends WorkerEntrypoint {}',
      'export default AdminEntry;',
      'export { AdminEntry };',
    ].join('\n');

    const result = transform(code, { classWrappers: new Map(), optionsFn: '(env) => ({})' })!;

    const wrapCount = (result.code.match(/withSentry\(/g) ?? []).length;
    expect(wrapCount).toBe(1);
  });

  it('wraps DO but skips already-wrapped default export', () => {
    const code = [
      'class DurableObject {}',
      'export class MyDO extends DurableObject {}',
      "import { withSentry } from '@sentry/cloudflare';",
      'export default withSentry((env) => ({}), { fetch() {} });',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    // DO still wrapped
    expect(result.code).toContain('export { __SENTRY_WRAPPED_MyDO__ as MyDO };');
    // Default not double-wrapped
    expect(result.code).not.toContain('__SENTRY_DEFAULT_EXPORT__');
  });
});

describe('same-worker RPC binding floor', () => {
  it('declares the merged options callback after both imports and uses it at every wrapper site', () => {
    const code = [
      'export class MyDO {}',
      'export class MyWorkflow {}',
      'export default { fetch() { return new Response("ok"); } };',
    ].join('\n');

    const result = transform(code, {
      classWrappers: new Map<string, ClassWrapperKind>([
        ['MyDO', 'durableObject'],
        ['MyWorkflow', 'workflow'],
      ]),
      optionsFn: '__SENTRY_OPTIONS_CALLBACK__',
      optionsImport: "import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.ts';\n",
      sameWorkerBindings: [{ bindingName: 'MY_DO', className: 'MyDO' }],
    })!;

    expect(result.code).toContain(
      [
        "import * as __SENTRY__ from '@sentry/cloudflare';",
        "import __SENTRY_OPTIONS_CALLBACK__ from './instrument.server.ts';",
        'const __SENTRY_OPTIONS__ = (env) => { const opts = (__SENTRY_OPTIONS_CALLBACK__)(env); return { ...opts, rpcTracePropagationBindings: ["MY_DO", ...(opts?.rpcTracePropagationBindings ?? [])] }; };',
      ].join('\n'),
    );
    expect(result.code).toContain('__SENTRY__.instrumentDurableObjectWithSentry(__SENTRY_OPTIONS__,');
    expect(result.code).toContain('__SENTRY__.instrumentWorkflowWithSentry(__SENTRY_OPTIONS__,');
    expect(result.code).toContain('__SENTRY__.withSentry(__SENTRY_OPTIONS__, __SENTRY_DEFAULT_EXPORT__)');
  });

  it('passes the env fallback callback through when there is no instrument file', () => {
    const code = 'export class MyDO {}';

    const result = transform(code, {
      classWrappers: doWrappers('MyDO'),
      optionsFn: '() => undefined',
      sameWorkerBindings: [{ bindingName: 'MY_DO', className: 'MyDO' }],
    })!;

    expect(result.code).toContain(
      'const __SENTRY_OPTIONS__ = (env) => { const opts = (() => undefined)(env); return { ...opts, rpcTracePropagationBindings: ["MY_DO", ...(opts?.rpcTracePropagationBindings ?? [])] }; };',
    );
  });

  it('enables a self service binding without an entrypoint only when it wrapped the default export', () => {
    const code = 'export default { fetch() { return new Response("ok"); } };';

    const result = transform(code, {
      classWrappers: doWrappers(),
      optionsFn: '() => undefined',
      sameWorkerBindings: [{ bindingName: 'SELF', className: DEFAULT_EXPORT }],
    })!;

    expect(result.code).toContain('rpcTracePropagationBindings: ["SELF",');
  });

  it('enables a self service binding when it wrapped a default re-export', () => {
    const result = transform("export { default } from './handler';", {
      classWrappers: doWrappers(),
      optionsFn: '() => undefined',
      sameWorkerBindings: [{ bindingName: 'SELF', className: DEFAULT_EXPORT }],
    })!;

    expect(result.code).toContain('rpcTracePropagationBindings: ["SELF",');
  });

  it('enables a self service binding when the default export re-exports an already wrapped class', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class AdminEntry extends WorkerEntrypoint {}',
      'export { AdminEntry };',
      'export default AdminEntry;',
    ].join('\n');

    const result = transform(code, {
      classWrappers: new Map(),
      optionsFn: '() => undefined',
      sameWorkerBindings: [{ bindingName: 'SELF', className: DEFAULT_EXPORT }],
    })!;

    expect(result.code).toContain('rpcTracePropagationBindings: ["SELF",');
  });

  it('drops a binding whose class was wrapped by hand', () => {
    // A hand-wrapped receiver runs on its own options and would see the trailing argument.
    const code = [
      'export const MyDO = Sentry.instrumentDurableObjectWithSentry(options, class {});',
      'export default { fetch() { return new Response("ok"); } };',
    ].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyDO'),
      optionsFn: '() => undefined',
      sameWorkerBindings: [{ bindingName: 'MY_DO', className: 'MyDO' }],
    })!;

    expect(result.code).not.toContain('rpcTracePropagationBindings');
  });

  it('keeps a binding whose class is re-exported from another module', () => {
    const code = ['export { MyDO } from "./myDo";', 'export default { fetch() {} };'].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyDO'),
      optionsFn: '() => undefined',
      sameWorkerBindings: [{ bindingName: 'MY_DO', className: 'MyDO' }],
    })!;

    expect(result.code).toContain('rpcTracePropagationBindings: ["MY_DO",');
    expect(result.code).toContain(
      '__SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.instrumentDurableObjectWithSentry, __SENTRY_OPTIONS__, __SENTRY_REEXPORT_MyDO__)',
    );
  });

  it('leaves the output untouched when there are no same-worker bindings', () => {
    const code = 'export class MyDO {}';
    const ctx: TransformContext = { classWrappers: doWrappers('MyDO'), optionsFn: '() => undefined' };

    expect(transform(code, { ...ctx, sameWorkerBindings: [] })!.code).toBe(transform(code, ctx)!.code);
  });
});
