import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { applyAutoInstrumentTransforms, type TransformContext } from '../../src/vite/transform';

function parseJS(code: string) {
  return parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as { body: any[] };
}

function transform(code: string, ctx: TransformContext) {
  return applyAutoInstrumentTransforms(code, parseJS(code), ctx);
}

// ---------------------------------------------------------------------------
// Default export wrapping
// ---------------------------------------------------------------------------

describe('default export wrapping', () => {
  const ctx: TransformContext = { optionsFn: '(env) => ({})' };

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
// Nothing to wrap
// ---------------------------------------------------------------------------

describe('nothing to wrap', () => {
  it('returns undefined when the entry is already wrapped manually', () => {
    const code = [
      "import { withSentry } from '@sentry/cloudflare';",
      'export default withSentry((env) => ({}), { fetch() {} });',
    ].join('\n');

    expect(transform(code, { optionsFn: '(env) => ({})' })).toBeUndefined();
  });
});
