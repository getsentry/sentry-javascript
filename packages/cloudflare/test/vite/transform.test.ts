import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { applyAutoInstrumentTransforms, type ClassWrapperKind, type TransformContext } from '../../src/vite/transform';

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

function transform(code: string, ctx: TransformContext) {
  return applyAutoInstrumentTransforms(code, parseJS(code), ctx);
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
    expect(result.code).toContain('const __SENTRY_DEFAULT_EXPORT__ = handler');
    expect(result.code).toContain('__SENTRY__.withSentry((env) => ({}), __SENTRY_DEFAULT_EXPORT__)');
    expect(result.code).not.toContain('export default handler');
    expect(result.map).toBeDefined();
  });

  it('wraps an inline object default export', () => {
    const code = 'export default { fetch() { return new Response("ok"); } };';
    const result = transform(code, ctx)!;
    expect(result).toBeDefined();
    expect(result.code).toContain('const __SENTRY_DEFAULT_EXPORT__ =');
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

    expect(result.code).toContain('class __SENTRY_ORIGINAL_MyDurableObject__');
    expect(result.code).not.toContain('export class MyDurableObject');
    expect(result.code).toContain('__SENTRY__.instrumentDurableObjectWithSentry(');
    expect(result.code).toContain('export const MyDurableObject =');
    expect(result.code).toContain('__SENTRY_ORIGINAL_MyDurableObject__');
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
    expect(result.code).toContain('export const DOA =');
    expect(result.code).toContain('export const DOB =');
    expect(result.code).toContain('class __SENTRY_ORIGINAL_DOA__');
    expect(result.code).toContain('class __SENTRY_ORIGINAL_DOB__');
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
    expect(result.code).toContain('class __SENTRY_ORIGINAL_MyDurableObject__');
    expect(result.code).toContain(
      'const MyDurableObject = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({}), __SENTRY_ORIGINAL_MyDurableObject__);',
    );
    // The original specifier export keeps exporting the wrapped binding.
    expect(result.code).toContain('export { MyDurableObject };');
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
    expect(result.code).toContain('class __SENTRY_ORIGINAL_Internal__');
    expect(result.code).toContain(
      'const Internal = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({}), __SENTRY_ORIGINAL_Internal__);',
    );
    expect(result.code).toContain('export { Internal as MyDurableObject };');
    expect(result.wrappedClasses).toEqual(new Set(['MyDurableObject']));
  });

  it('leaves re-exports from other modules alone and reports them unwrapped', () => {
    const code = "export { MyDurableObject } from './do';";
    expect(transform(code, ctx)).toBeUndefined();
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
    expect(result.code).not.toContain('__SENTRY_ORIGINAL_');
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
    expect(result.code).toContain('class __SENTRY_ORIGINAL_MyWorkflow__');
    expect(result.code).not.toContain('export class MyWorkflow');
    expect(result.code).toContain('export const MyWorkflow = __SENTRY__.instrumentWorkflowWithSentry(');
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
      'const MyWorkflow = __SENTRY__.instrumentWorkflowWithSentry((env) => ({}), __SENTRY_ORIGINAL_MyWorkflow__);',
    );
    expect(result.code).toContain('export { MyWorkflow };');
    expect(result.wrappedClasses).toEqual(new Set(['MyWorkflow']));
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
    expect(result.code).toContain('export const MyDO = __SENTRY__.instrumentDurableObjectWithSentry(');
    expect(result.code).toContain('export const MyWorkflow = __SENTRY__.instrumentWorkflowWithSentry(');
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
    expect(result.code).toContain('class __SENTRY_ORIGINAL_MyDO__');
    expect(result.code).toContain('export const MyDO = __SENTRY__.instrumentDurableObjectWithSentry(');

    // Default export wrapped
    expect(result.code).toContain('const __SENTRY_DEFAULT_EXPORT__ =');
    expect(result.code).toContain('export default __SENTRY__.withSentry(');

    // Single import
    const importCount = (result.code.match(/import \* as __SENTRY__/g) ?? []).length;
    expect(importCount).toBe(1);
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
    expect(result.code).toContain('export const MyDO =');
    // Default not double-wrapped
    expect(result.code).not.toContain('__SENTRY_DEFAULT_EXPORT__');
  });
});
