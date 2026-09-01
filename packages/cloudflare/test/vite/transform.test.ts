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
    expect(result.code).toContain('class __SENTRY_ORIGINAL_AdminEntry__');
    expect(result.code).not.toContain('export class AdminEntry');
    expect(result.code).toContain('export const AdminEntry = __SENTRY__.withSentry(');
    expect(result.wrappedClasses).toEqual(new Set(['AdminEntry']));
  });

  it('wraps a class extending an aliased WorkerEntrypoint import', () => {
    const code = [
      "import { WorkerEntrypoint as WE } from 'cloudflare:workers';",
      'export class AdminEntry extends WE {}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain('export const AdminEntry = __SENTRY__.withSentry(');
  });

  it('wraps a class extending a namespace-imported WorkerEntrypoint', () => {
    const code = [
      "import * as cf from 'cloudflare:workers';",
      'export class AdminEntry extends cf.WorkerEntrypoint {}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain('export const AdminEntry = __SENTRY__.withSentry(');
  });

  it('wraps a class via an indirect same-file base chain', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class Base extends WorkerEntrypoint {}',
      'export class AdminEntry extends Base {}',
    ].join('\n');

    const result = transform(code, ctx)!;
    expect(result.code).toContain('export const AdminEntry = __SENTRY__.withSentry(');
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
      'const AdminEntry = __SENTRY__.withSentry((env) => ({}), __SENTRY_ORIGINAL_AdminEntry__);',
    );
    expect(result.code).toContain('export { AdminEntry };');
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
    expect(result.code).toContain('export const AdminEntry = __SENTRY__.withSentry(');
    expect(result.wrappedClasses).toEqual(new Set(['AdminEntry']));
  });

  it('ignores an entrypoint that is neither structurally detected nor configured', () => {
    const other: TransformContext = { classWrappers: new Map(), optionsFn: '(env) => ({})' };
    const code = ["import { BaseEntry } from './base';", 'export class AdminEntry extends BaseEntry {}'].join('\n');
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

    expect(result.code).toContain('export const MyAgent = __SENTRY__.instrumentAgentWithSentry(');
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

    expect(result.code).toContain('export const MyDO = __SENTRY__.instrumentDurableObjectWithSentry(');
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

    expect(result.code).toContain('export const MyAgent = __SENTRY__.instrumentAgentWithSentry(');
    expect(result.code).toContain('export const MyDO = __SENTRY__.instrumentDurableObjectWithSentry(');
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
        'class __SENTRY_ORIGINAL_MyAgent__ extends Agent {}',
        'export const MyAgent = __SENTRY__.instrumentAgentWithSentry((env) => ({ dsn: env.SENTRY_DSN }), __SENTRY_ORIGINAL_MyAgent__);',
        '',
        'class __SENTRY_ORIGINAL_MyChat__ extends AIChatAgent {}',
        'export const MyChat = __SENTRY__.instrumentAgentWithSentry((env) => ({ dsn: env.SENTRY_DSN }), __SENTRY_ORIGINAL_MyChat__);',
        '',
        'class __SENTRY_ORIGINAL_MyDO__ extends DurableObject {}',
        'export const MyDO = __SENTRY__.instrumentDurableObjectWithSentry((env) => ({ dsn: env.SENTRY_DSN }), __SENTRY_ORIGINAL_MyDO__);',
        '',
        'const __SENTRY_DEFAULT_EXPORT__ = { fetch() {} };',
        'export default __SENTRY__.withSentry((env) => ({ dsn: env.SENTRY_DSN }), __SENTRY_DEFAULT_EXPORT__);',
        '',
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

    expect(result.code).toContain('const LocalAgent = __SENTRY__.instrumentAgentWithSentry(');
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
    expect(result.code).toContain('const AdminEntry = __SENTRY__.withSentry(');
    expect(result.code).not.toContain('__SENTRY_DEFAULT_EXPORT__');
    // The default export still points at the (single-)wrapped binding.
    expect(result.code).toContain('export default AdminEntry;');
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
    expect(result.code).toContain('export const MyDO =');
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

  it('drops a binding whose class is re-exported from another module', () => {
    const code = ['export { MyDO } from "./myDo";', 'export default { fetch() {} };'].join('\n');

    const result = transform(code, {
      classWrappers: doWrappers('MyDO'),
      optionsFn: '() => undefined',
      sameWorkerBindings: [{ bindingName: 'MY_DO', className: 'MyDO' }],
    })!;

    expect(result.code).toContain('const __SENTRY_OPTIONS__ = () => undefined;');
    expect(result.code).not.toContain('rpcTracePropagationBindings');
  });

  it('leaves the output untouched when there are no same-worker bindings', () => {
    const code = 'export class MyDO {}';
    const ctx: TransformContext = { classWrappers: doWrappers('MyDO'), optionsFn: '() => undefined' };

    expect(transform(code, { ...ctx, sameWorkerBindings: [] })!.code).toBe(transform(code, ctx)!.code);
  });
});
