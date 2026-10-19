import { describe, expect, it } from 'vitest';
import { makeTunnelRoutePlugin } from '../../src/vite/makeTunnelRoutePlugin';

type Transform = (code: string, id: string, options?: { ssr?: boolean }) => { code: string } | null;

describe('makeTunnelRoutePlugin', () => {
  const transform = makeTunnelRoutePlugin().transform as unknown as Transform;

  it('adds the tunnel route to the SSR server build', () => {
    const result = transform('export const routes = {};', '\0virtual:react-router/server-build', { ssr: true });

    expect(result?.code).toContain(
      "Object.assign(routes, __sentryCreateTunnelRoutes(typeof basename === 'string' ? basename : undefined));",
    );
    expect(result?.code).toContain("from '@sentry/react-router'");
  });

  it('leaves other modules and the client build alone', () => {
    expect(transform('', '\0virtual:react-router/server-build', { ssr: false })).toBeNull();
    expect(transform('', '/app/root.tsx', { ssr: true })).toBeNull();
  });
});
