import { describe, expect, it } from 'vitest';
import { addRouteTreeInstrumentation, makeRouteErrorPlugin } from '../../src/vite/routeErrors';

const ROUTE_TREE = `import { Route as rootRouteImport } from './routes/__root'

export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes()
`;

describe('addRouteTreeInstrumentation', () => {
  it('appends the instrumentation call to the generated route tree', () => {
    const result = addRouteTreeInstrumentation(ROUTE_TREE, '/app/src/routeTree.gen.ts');

    expect(result?.code.startsWith(ROUTE_TREE)).toBe(true);
    expect(result?.code).toContain(
      "import { _INTERNAL_instrumentServerRouteTree as __sentryInstrumentServerRouteTree } from '@sentry/tanstackstart-react';",
    );
    expect(result?.code).toContain('__sentryInstrumentServerRouteTree(routeTree);');
  });

  it('ignores the query string of the module id', () => {
    expect(addRouteTreeInstrumentation(ROUTE_TREE, '/app/src/routeTree.gen.ts?v=123')).not.toBeNull();
  });

  it.each(['/app/src/router.tsx', '/app/src/routes/index.tsx', '/app/src/myRouteTree.gen.css'])(
    'does not change %s',
    id => {
      expect(addRouteTreeInstrumentation(ROUTE_TREE, id)).toBeNull();
    },
  );

  it('does not change a route tree file without the `routeTree` export', () => {
    expect(addRouteTreeInstrumentation('export const somethingElse = 1;', '/app/src/routeTree.gen.ts')).toBeNull();
  });
});

describe('makeRouteErrorPlugin', () => {
  const transform = makeRouteErrorPlugin().transform as (
    this: { environment?: { config: { consumer: 'client' | 'server' } } },
    code: string,
    id: string,
  ) => { code: string } | null;

  it('instruments the route tree in server environments', () => {
    const result = transform.call(
      { environment: { config: { consumer: 'server' } } },
      ROUTE_TREE,
      '/app/src/routeTree.gen.ts',
    );

    expect(result?.code).toContain('__sentryInstrumentServerRouteTree(routeTree);');
  });

  it('does not change the route tree in client environments', () => {
    const result = transform.call(
      { environment: { config: { consumer: 'client' } } },
      ROUTE_TREE,
      '/app/src/routeTree.gen.ts',
    );

    expect(result).toBeNull();
  });
});
