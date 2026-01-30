import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import {
  addSentryImport,
  arrayToObjectShorthand,
  makeAutoInstrumentMiddlewarePlugin,
  wrapGlobalMiddleware,
  wrapRouteMiddleware,
  wrapServerFnMiddleware,
} from '../../src/vite/autoInstrumentMiddleware';

type PluginWithTransform = Plugin & {
  transform: (code: string, id: string) => { code: string; map: null } | null;
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

describe('addSentryImport', () => {
  it('prepends import to code without directives', () => {
    const code = 'const foo = 1;';
    const result = addSentryImport(code);

    expect(result).toBe("import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';\nconst foo = 1;");
  });

  it('inserts import after use server directive', () => {
    const code = "'use server';\nconst foo = 1;";
    const result = addSentryImport(code);

    expect(result).toMatch(/^'use server';\nimport \{ wrapMiddlewaresWithSentry \}/);
    expect(result).toContain('const foo = 1;');
  });

  it('inserts import after use client directive', () => {
    const code = '"use client";\nconst foo = 1;';
    const result = addSentryImport(code);

    expect(result).toMatch(/^"use client";\nimport \{ wrapMiddlewaresWithSentry \}/);
    expect(result).toContain('const foo = 1;');
  });

  it('does not add import if it already exists', () => {
    const code = "import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';\nconst foo = 1;";
    const result = addSentryImport(code);

    expect(result).toBe(code);
    // Verify the import appears exactly once
    const importCount = (result.match(/import \{ wrapMiddlewaresWithSentry \}/g) || []).length;
    expect(importCount).toBe(1);
  });
});

describe('arrayToObjectShorthand', () => {
  it('converts single identifier', () => {
    expect(arrayToObjectShorthand('foo')).toBe('{ foo }');
  });

  it('converts multiple identifiers', () => {
    expect(arrayToObjectShorthand('foo, bar, baz')).toBe('{ foo, bar, baz }');
  });

  it('handles whitespace', () => {
    expect(arrayToObjectShorthand('  foo  ,  bar  ')).toBe('{ foo, bar }');
  });

  it('returns null for empty string', () => {
    expect(arrayToObjectShorthand('')).toBeNull();
  });

  it('returns null for function calls', () => {
    expect(arrayToObjectShorthand('getMiddleware()')).toBeNull();
  });

  it('returns null for spread syntax', () => {
    expect(arrayToObjectShorthand('...middlewares')).toBeNull();
  });

  it('returns null for mixed valid and invalid', () => {
    expect(arrayToObjectShorthand('foo, bar(), baz')).toBeNull();
  });

  it('deduplicates entries', () => {
    expect(arrayToObjectShorthand('foo, foo, bar')).toBe('{ foo, bar }');
  });
});
