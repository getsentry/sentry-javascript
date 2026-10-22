import { parseSync, type Plugin } from 'vite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadParser, parseModule } from '@sentry/bundler-plugins/rewriter';
import {
  makeAutoInstrumentMiddlewarePlugin,
  wrapGlobalMiddleware,
  wrapRouteMiddleware,
  wrapServerFnMiddleware,
} from '../../src/vite/autoInstrumentMiddleware';

beforeAll(async () => {
  await loadParser();
});

type PluginWithTransform = Plugin & {
  transform: (code: string, id: string) => { code: string; map: unknown } | null;
};

describe('makeAutoInstrumentMiddlewarePlugin', () => {
  const createStartFile = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [authMiddleware] }));
`;

  const routeFile = `
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [authMiddleware],
    handlers: { GET: () => ({}) },
  },
});
`;

  it('does not instrument non-TS/JS files', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(createStartFile, '/app/start.css');

    expect(result).toBeNull();
  });

  it('does not instrument when enabled is false', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin({ enabled: false }) as PluginWithTransform;
    const result = plugin.transform(createStartFile, '/app/start.ts');

    expect(result).toBeNull();
  });

  it('does not instrument files without createStart or createFileRoute', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = "export const foo = 'bar';";
    const result = plugin.transform(code, '/app/other.ts');

    expect(result).toBeNull();
  });

  it('does not instrument files that already use wrapMiddlewaresWithSentry', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';
createStart(() => ({ requestMiddleware: wrapMiddlewaresWithSentry({ myMiddleware }) }));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result).toBeNull();
  });

  it('adds import statement when wrapping middlewares', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(createStartFile, '/app/start.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain("import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react'");
  });

  it('instruments both start files and route files', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;

    const startResult = plugin.transform(createStartFile, '/app/start.ts');
    expect(startResult).not.toBeNull();
    expect(startResult!.code).toContain('wrapMiddlewaresWithSentry');

    const routeResult = plugin.transform(routeFile, '/app/routes/foo.ts');
    expect(routeResult).not.toBeNull();
    expect(routeResult!.code).toContain('wrapMiddlewaresWithSentry');
  });

  it('warns about middlewares that cannot be auto-wrapped', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [getMiddleware()] }));
`;
    plugin.transform(code, '/app/start.ts');

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not auto-instrument requestMiddleware'));

    consoleWarnSpy.mockRestore();
  });

  it('keeps the warning text for middlewares that cannot be auto-wrapped', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [getMiddleware()], functionMiddleware: [...shared] }));
`;
    plugin.transform(code, '/app/start.ts');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry] Could not auto-instrument requestMiddleware and functionMiddleware in /app/start.ts. ' +
        'To instrument these middlewares, use wrapMiddlewaresWithSentry() manually. ',
    );

    consoleWarnSpy.mockRestore();
  });

  it('returns a source map for the rewritten code', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(createStartFile, '/app/start.ts');

    expect(result!.map).toEqual(expect.objectContaining({ mappings: expect.any(String) }));
    expect(() => parseModule(result!.code, '/app/start.ts')).not.toThrow();
  });

  it('instruments a createStart file whose id does not contain "start"', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(createStartFile, '/app/src/app-entry.ts');

    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
  });

  it('wraps the other sites of a file in which one site is already wrapped', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';
createStart(() => ({
  requestMiddleware: wrapMiddlewaresWithSentry({ myMiddleware }),
  functionMiddleware: [loggingMiddleware],
}));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ myMiddleware })');
    expect(result!.code).toContain('functionMiddleware: wrapMiddlewaresWithSentry({ loggingMiddleware })');
    expect(result!.code.match(/import \{ wrapMiddlewaresWithSentry \}/g)).toHaveLength(1);
  });

  it("inserts the import after a 'use server' directive", () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(`'use server';\n${createStartFile}`, '/app/start.ts');

    expect(result!.code).toMatch(
      /^'use server';\nimport \{ wrapMiddlewaresWithSentry \} from '@sentry\/tanstackstart-react';/,
    );
  });

  it("parses with Rolldown's `this.parse` in Vite 8", () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const parse = vi.fn((input: string, options: object) => parseSync('module', input, options).program);
    const code = `${createStartFile}const typed: string = '';\n`;

    const result = plugin.transform.call({ meta: { rolldownVersion: '1.2.11' }, parse }, code, '/app/start.ts');
    expect(parse).toHaveBeenCalledWith(code, { lang: 'ts', preserveParens: false });
    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
  });

  it('instruments server function middlewares', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createServerFn } from '@tanstack/react-start';
export const serverFn = createServerFn().middleware([authMiddleware]).handler(async () => ({}));
`;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result!.code).toContain('.middleware(wrapMiddlewaresWithSentry({ authMiddleware }))');
    expect(result!.code).toContain("import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react'");
  });
});

describe('wrapGlobalMiddleware', () => {
  it('wraps requestMiddleware and functionMiddleware arrays', () => {
    const code = `
createStart(() => ({
  requestMiddleware: [authMiddleware],
  functionMiddleware: [loggingMiddleware],
}));
`;
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
    expect(result.code).toContain('functionMiddleware: wrapMiddlewaresWithSentry({ loggingMiddleware })');
    expect(result.skipped).toHaveLength(0);
  });

  it('wraps single middleware entry correctly', () => {
    const code = 'createStart(() => ({ requestMiddleware: [singleMiddleware] }));';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ singleMiddleware })');
  });

  it('wraps multiple middleware entries correctly', () => {
    const code = 'createStart(() => ({ requestMiddleware: [a, b, c] }));';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ a, b, c })');
  });

  it('does not wrap empty middleware arrays', () => {
    const code = 'createStart(() => ({ requestMiddleware: [] }));';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.skipped).toHaveLength(0);
  });

  it('does not wrap if middleware contains function calls', () => {
    const code = 'createStart(() => ({ requestMiddleware: [getMiddleware()] }));';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.skipped).toContain('requestMiddleware');
  });

  it('wraps valid array and skips invalid array in same file', () => {
    const code = `
createStart(() => ({
  requestMiddleware: [authMiddleware],
  functionMiddleware: [getMiddleware()]
}));
`;
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
    expect(result.code).toContain('functionMiddleware: [getMiddleware()]');
    expect(result.skipped).toContain('functionMiddleware');
  });

  it('handles trailing commas in middleware arrays', () => {
    const code = 'createStart(() => ({ requestMiddleware: [authMiddleware,] }));';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
  });

  it('skips a nested middleware array', () => {
    const code = 'createStart(() => ({ requestMiddleware: [authMiddleware, [loggingMiddleware]] }));';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.code).toBe(code);
    expect(result.skipped).toEqual(['requestMiddleware']);
  });

  it('is not confused by a `]` inside a string', () => {
    const code = "createStart(() => ({ requestMiddleware: [authMiddleware], name: ']' }));";
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toBe(
      "createStart(() => ({ requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware }), name: ']' }));",
    );
  });

  it('deduplicates middleware entries', () => {
    const code = 'createStart(() => ({ requestMiddleware: [a, b, a] }));';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ a, b })');
  });

  it('ignores middleware keys outside createStart()', () => {
    const code = 'const config = { requestMiddleware: [authMiddleware] };';
    const result = wrapGlobalMiddleware(code, '/app/start.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.code).toBe(code);
  });

  it('logs debug message when debug is enabled', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = 'createStart(() => ({ requestMiddleware: [authMiddleware] }));';
    wrapGlobalMiddleware(code, '/app/start.ts', true);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-wrapping requestMiddleware'));

    consoleLogSpy.mockRestore();
  });
});

describe('wrapRouteMiddleware', () => {
  it('wraps route-level middleware arrays', () => {
    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [loggingMiddleware],
    handlers: { GET: () => ({}) },
  },
});
`;
    const result = wrapRouteMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('middleware: wrapMiddlewaresWithSentry({ loggingMiddleware })');
    expect(result.skipped).toHaveLength(0);
  });

  it('wraps multiple middlewares in route file', () => {
    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [authMiddleware, loggingMiddleware],
    handlers: { GET: () => ({}) },
  },
});
`;
    const result = wrapRouteMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('middleware: wrapMiddlewaresWithSentry({ authMiddleware, loggingMiddleware })');
  });

  it('wraps handler-level middleware arrays', () => {
    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          middleware: [loggingMiddleware],
          handler: () => ({ data: 'test' }),
        },
      }),
  },
});
`;
    const result = wrapRouteMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('middleware: wrapMiddlewaresWithSentry({ loggingMiddleware })');
  });

  it('wraps multiple handler-level middleware arrays in same file', () => {
    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          middleware: [readMiddleware],
          handler: () => ({}),
        },
        POST: {
          middleware: [writeMiddleware, authMiddleware],
          handler: () => ({}),
        },
      }),
  },
});
`;
    const result = wrapRouteMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('middleware: wrapMiddlewaresWithSentry({ readMiddleware })');
    expect(result.code).toContain('middleware: wrapMiddlewaresWithSentry({ writeMiddleware, authMiddleware })');
  });

  it('does not wrap empty middleware arrays', () => {
    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [],
    handlers: { GET: () => ({}) },
  },
});
`;
    const result = wrapRouteMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.skipped).toHaveLength(0);
  });

  it('does not wrap middleware containing function calls', () => {
    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [createMiddleware()],
    handlers: { GET: () => ({}) },
  },
});
`;
    const result = wrapRouteMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.skipped).toContain('middleware');
  });

  it('wraps both route-level and handler-level middleware in same file', () => {
    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [routeMiddleware],
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          middleware: [getMiddleware],
          handler: () => ({}),
        },
      }),
  },
});
`;
    const result = wrapRouteMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('middleware: wrapMiddlewaresWithSentry({ routeMiddleware })');
    expect(result.code).toContain('middleware: wrapMiddlewaresWithSentry({ getMiddleware })');
  });

  it('logs debug message when debug is enabled', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = `
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [authMiddleware],
    handlers: { GET: () => ({}) },
  },
});
`;
    wrapRouteMiddleware(code, '/app/routes/foo.ts', true);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-wrapping middleware'));

    consoleLogSpy.mockRestore();
  });
});

describe('wrapServerFnMiddleware', () => {
  it('wraps single middleware in createServerFn().middleware()', () => {
    const code = `
const serverFn = createServerFn()
  .middleware([authMiddleware])
  .handler(async () => ({}));
`;
    const result = wrapServerFnMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('.middleware(wrapMiddlewaresWithSentry({ authMiddleware }))');
    expect(result.skipped).toHaveLength(0);
  });

  it('wraps multiple middlewares in createServerFn().middleware()', () => {
    const code = `
const serverFn = createServerFn()
  .middleware([authMiddleware, loggingMiddleware])
  .handler(async () => ({}));
`;
    const result = wrapServerFnMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('.middleware(wrapMiddlewaresWithSentry({ authMiddleware, loggingMiddleware }))');
  });

  it('does not wrap empty middleware arrays', () => {
    const code = `
const serverFn = createServerFn()
  .middleware([])
  .handler(async () => ({}));
`;
    const result = wrapServerFnMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.skipped).toHaveLength(0);
  });

  it('does not wrap middleware containing function calls', () => {
    const code = `
const serverFn = createServerFn()
  .middleware([createMiddleware()])
  .handler(async () => ({}));
`;
    const result = wrapServerFnMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(false);
    expect(result.skipped).toContain('.middleware(');
  });

  it('handles multiple server functions in same file', () => {
    const code = `
const serverFn1 = createServerFn()
  .middleware([authMiddleware])
  .handler(async () => ({}));

const serverFn2 = createServerFn()
  .middleware([loggingMiddleware])
  .handler(async () => ({}));
`;
    const result = wrapServerFnMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('.middleware(wrapMiddlewaresWithSentry({ authMiddleware }))');
    expect(result.code).toContain('.middleware(wrapMiddlewaresWithSentry({ loggingMiddleware }))');
  });

  it('handles trailing commas in middleware arrays', () => {
    const code = `
const serverFn = createServerFn()
  .middleware([authMiddleware,])
  .handler(async () => ({}));
`;
    const result = wrapServerFnMiddleware(code, '/app/routes/foo.ts', false);

    expect(result.didWrap).toBe(true);
    expect(result.code).toContain('.middleware(wrapMiddlewaresWithSentry({ authMiddleware }))');
  });
});
