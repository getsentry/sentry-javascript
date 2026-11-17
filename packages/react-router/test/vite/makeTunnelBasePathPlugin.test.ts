import { describe, expect, it } from 'vitest';
import { makeTunnelBasePathPlugin } from '../../src/vite/makeTunnelBasePathPlugin';

type Transform = (code: string, id: string, options?: { ssr?: boolean }) => { code: string } | null;

describe('makeTunnelBasePathPlugin', () => {
  const transform = makeTunnelBasePathPlugin().transform as unknown as Transform;

  it('passes the basename of the SSR server build to the tunnel', () => {
    const result = transform('export const basename = "/app";', '\0virtual:react-router/server-build', { ssr: true });

    expect(result?.code).toContain("__sentrySetTunnelBasePath(typeof basename === 'string' ? basename : undefined);");
    expect(result?.code).toContain("from '@sentry/react-router'");
  });

  it('leaves other modules and the client build alone', () => {
    expect(transform('', '\0virtual:react-router/server-build', { ssr: false })).toBeNull();
    expect(transform('', '/app/root.tsx', { ssr: true })).toBeNull();
  });
});
