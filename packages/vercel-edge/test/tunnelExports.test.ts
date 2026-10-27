import { describe, expect, it } from 'vitest';
import * as Sentry from '../src';
import type { HandleTunnelRequestOptions, ServerTunnelOptions, TunnelRequestLike } from '../src';

describe('managed tunnel exports', () => {
  it.each([
    'serveTunnelIntegration',
    'handleTunnelRequestIfMatched',
    'isTunnelRequest',
    'getTunnelPath',
    'handleTunnelRequest',
  ])('exports %s for wiring the tunnel by hand', name => {
    expect(typeof (Sentry as Record<string, unknown>)[name]).toBe('function');
  });

  it('exports the tunnel types', () => {
    const tunnelOptions: ServerTunnelOptions = { allowedDsns: [] };
    const request: TunnelRequestLike = { method: 'POST', url: '/tunnel' };
    const handleOptions: HandleTunnelRequestOptions = { request: new Request('http://localhost/tunnel') };

    expect([tunnelOptions, request, handleOptions]).toHaveLength(3);
  });
});
