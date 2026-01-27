import type { Plugin } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { arrayToObjectShorthand, makeAutoInstrumentMiddlewarePlugin } from '../../src/vite/autoInstrumentMiddleware';

type PluginWithTransform = Plugin & {
  transform: (code: string, id: string) => { code: string; map: null } | null;
};

describe('makeAutoInstrumentMiddlewarePlugin', () => {
  const createStartFile = `
import { createStart } from '@tanstack/react-start';
import { authMiddleware, loggingMiddleware } from './middleware';

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
  functionMiddleware: [loggingMiddleware],
}));
`;

  it('instruments a file with createStart and middleware arrays', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(createStartFile, '/app/start.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain("import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react'");
    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
    expect(result!.code).toContain('functionMiddleware: wrapMiddlewaresWithSentry({ loggingMiddleware })');
  });

  it('does not instrument files without createStart', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = "export const foo = 'bar';";
    const result = plugin.transform(code, '/app/other.ts');

    expect(result).toBeNull();
  });

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

  it('wraps single middleware entry correctly', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [singleMiddleware] }));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ singleMiddleware })');
  });

  it('wraps multiple middleware entries correctly', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [a, b, c] }));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ a, b, c })');
  });

  it('does not wrap empty middleware arrays', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [] }));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result).toBeNull();
  });

  it('does not wrap if middleware contains function calls', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [getMiddleware()] }));
`;
    const result = plugin.transform(code, '/app/start.ts');

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

  it('handles files with use server directive', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `'use server';
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [authMiddleware] }));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toMatch(/^'use server';\s*\nimport \{ wrapMiddlewaresWithSentry \}/);
  });

  it('handles files with use client directive', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `"use client";
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [authMiddleware] }));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toMatch(/^"use client";\s*\nimport \{ wrapMiddlewaresWithSentry \}/);
  });

  it('handles trailing commas in middleware arrays', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({ requestMiddleware: [authMiddleware,] }));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
  });

  it('wraps valid array and skips invalid array in same file', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({
  requestMiddleware: [authMiddleware],
  functionMiddleware: [getMiddleware()]
}));
`;
    const result = plugin.transform(code, '/app/start.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain('requestMiddleware: wrapMiddlewaresWithSentry({ authMiddleware })');
    expect(result!.code).toContain('functionMiddleware: [getMiddleware()]');
  });

  it('warns when middleware contains expressions that cannot be auto-wrapped', () => {
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

  it('warns about skipped middlewares even when others are successfully wrapped', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const code = `
import { createStart } from '@tanstack/react-start';
createStart(() => ({
  requestMiddleware: [authMiddleware],
  functionMiddleware: [getMiddleware()]
}));
`;
    plugin.transform(code, '/app/start.ts');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not auto-instrument functionMiddleware'),
    );

    consoleWarnSpy.mockRestore();
  });
});

describe('route-level middleware auto-instrumentation', () => {
  const routeFileWithMiddleware = `
import { createFileRoute } from '@tanstack/react-router';
import { loggingMiddleware } from '../middleware';

export const Route = createFileRoute('/api/test')({
  server: {
    middleware: [loggingMiddleware],
    handlers: {
      GET: async () => ({ message: 'test' }),
    },
  },
});
`;

  it('instruments route-level middleware arrays', () => {
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(routeFileWithMiddleware, '/app/routes/api.test.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain("import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react'");
    expect(result!.code).toContain('middleware: wrapMiddlewaresWithSentry({ loggingMiddleware })');
  });

  it('instruments multiple middlewares in route file', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [authMiddleware, loggingMiddleware],
    handlers: { GET: () => ({}) },
  },
});
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain('middleware: wrapMiddlewaresWithSentry({ authMiddleware, loggingMiddleware })');
  });

  it('does not instrument files without createFileRoute', () => {
    const code = `
const middleware = [someMiddleware];
export const foo = { middleware };
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/utils.ts');

    expect(result).toBeNull();
  });

  it('does not instrument route files without middleware arrays', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/client')({
  component: () => '<div>Client only</div>',
});
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/client.tsx');

    expect(result).toBeNull();
  });

  it('does not instrument empty middleware arrays in route files', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [],
    handlers: { GET: () => ({}) },
  },
});
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).toBeNull();
  });
});

describe('handler-specific middleware auto-instrumentation', () => {
  it('instruments handler-level middleware arrays', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
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
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain('middleware: wrapMiddlewaresWithSentry({ loggingMiddleware })');
  });

  it('instruments multiple handler-level middleware arrays in same file', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
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
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain('middleware: wrapMiddlewaresWithSentry({ readMiddleware })');
    expect(result!.code).toContain('middleware: wrapMiddlewaresWithSentry({ writeMiddleware, authMiddleware })');
  });
});

describe('route middleware edge cases', () => {
  it('does not wrap middleware containing function calls in route files', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [createMiddleware()],
    handlers: { GET: () => ({}) },
  },
});
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).toBeNull();
  });

  it('warns about route middleware that cannot be auto-wrapped', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const code = `
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [getMiddleware()],
    handlers: { GET: () => ({}) },
  },
});
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    plugin.transform(code, '/app/routes/foo.ts');

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not auto-instrument route middleware'));

    consoleWarnSpy.mockRestore();
  });

  it('handles route files with use server directive', () => {
    const code = `'use server';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/foo')({
  server: {
    middleware: [authMiddleware],
    handlers: { GET: () => ({}) },
  },
});
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toMatch(/^'use server';\s*\nimport \{ wrapMiddlewaresWithSentry \}/);
  });

  it('does not instrument route files that already use wrapMiddlewaresWithSentry', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';
export const Route = createFileRoute('/foo')({
  server: {
    middleware: wrapMiddlewaresWithSentry({ authMiddleware }),
    handlers: { GET: () => ({}) },
  },
});
`;
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).toBeNull();
  });

  it('handles both route-level and handler-level middleware in same file', () => {
    const code = `
import { createFileRoute } from '@tanstack/react-router';
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
    const plugin = makeAutoInstrumentMiddlewarePlugin() as PluginWithTransform;
    const result = plugin.transform(code, '/app/routes/foo.ts');

    expect(result).not.toBeNull();
    expect(result!.code).toContain('middleware: wrapMiddlewaresWithSentry({ routeMiddleware })');
    expect(result!.code).toContain('middleware: wrapMiddlewaresWithSentry({ getMiddleware })');
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
