import { describe, expect, it, vi } from 'vitest';
import { readConnInfo } from '../../../src/integrations/hono/connInfo';
import type { Context } from '../../../src/integrations/hono/honoTypes';

function fakeContext({ env, headers }: { env?: unknown; headers?: Record<string, string> } = {}): Context {
  return {
    env,
    req: { raw: new Request('http://localhost/test', { headers }) },
  } as unknown as Context;
}

const throwingGetter = (key: string): object =>
  Object.defineProperty({}, key, {
    get() {
      throw new Error('unavailable');
    },
  });

describe('readConnInfo', () => {
  describe('node', () => {
    const socket = { remoteAddress: '203.0.113.5', remotePort: 54321, remoteFamily: 'IPv4' };
    const expected = { address: '203.0.113.5', port: 54321, addressType: 'IPv4' };

    it('reads the socket of `env.incoming`', () => {
      expect(readConnInfo(fakeContext({ env: { incoming: { socket } } }), 'node')).toEqual(expected);
    });

    it('reads the socket of `env.server.incoming`', () => {
      expect(readConnInfo(fakeContext({ env: { server: { incoming: { socket } } } }), 'node')).toEqual(expected);
    });

    it.each([
      { case: 'without `env`', env: undefined },
      { case: 'without an incoming message', env: {} },
    ])('returns undefined $case', ({ env }) => {
      expect(readConnInfo(fakeContext({ env }), 'node')).toBeUndefined();
    });

    it('returns undefined when the socket getter throws', () => {
      expect(readConnInfo(fakeContext({ env: { incoming: throwingGetter('socket') } }), 'node')).toBeUndefined();
    });
  });

  describe('bun', () => {
    const requestIP = (): object => ({ address: '::1', port: 54321, family: 'IPv6' });
    const expected = { address: '::1', port: 54321, addressType: 'IPv6' };

    it('calls `requestIP` of the server in `env`', () => {
      expect(readConnInfo(fakeContext({ env: { requestIP } }), 'bun')).toEqual(expected);
    });

    it('calls `requestIP` of `env.server`', () => {
      expect(readConnInfo(fakeContext({ env: { server: { requestIP } } }), 'bun')).toEqual(expected);
    });

    it('passes the raw request to `requestIP`', () => {
      const spy = vi.fn(requestIP);
      const context = fakeContext({ env: { requestIP: spy } });

      readConnInfo(context, 'bun');

      expect(spy).toHaveBeenCalledWith(context.req.raw);
    });

    it.each([
      { case: 'without a server', env: undefined },
      { case: 'without `requestIP`', env: {} },
      { case: 'when `requestIP` gives null', env: { requestIP: () => null } },
    ])('returns undefined $case', ({ env }) => {
      expect(readConnInfo(fakeContext({ env }), 'bun')).toBeUndefined();
    });

    it('returns undefined when `requestIP` throws', () => {
      const env = {
        requestIP: () => {
          throw new Error('closed');
        },
      };

      expect(readConnInfo(fakeContext({ env }), 'bun')).toBeUndefined();
    });
  });

  describe('deno', () => {
    it('reads `env.remoteAddr`', () => {
      const env = { remoteAddr: { hostname: '127.0.0.1', port: 54321, transport: 'tcp' } };

      expect(readConnInfo(fakeContext({ env }), 'deno')).toEqual({
        address: '127.0.0.1',
        port: 54321,
        transport: 'tcp',
      });
    });

    it.each([
      { case: 'without `env`', env: undefined },
      { case: 'without `remoteAddr`', env: {} },
    ])('returns undefined $case', ({ env }) => {
      expect(readConnInfo(fakeContext({ env }), 'deno')).toBeUndefined();
    });

    it('returns undefined when the `remoteAddr` getter throws', () => {
      expect(readConnInfo(fakeContext({ env: throwingGetter('remoteAddr') }), 'deno')).toBeUndefined();
    });
  });

  describe('cloudflare', () => {
    it('reads the `cf-connecting-ip` header', () => {
      const context = fakeContext({ headers: { 'cf-connecting-ip': '203.0.113.5' } });

      expect(readConnInfo(context, 'cloudflare')).toEqual({ address: '203.0.113.5' });
    });

    it('ignores the bindings in `env`', () => {
      const env = { incoming: { socket: { remoteAddress: '10.0.0.1' } }, remoteAddr: { hostname: '10.0.0.1' } };

      expect(readConnInfo(fakeContext({ env }), 'cloudflare')).toBeUndefined();
    });

    it('returns undefined without the header', () => {
      expect(readConnInfo(fakeContext(), 'cloudflare')).toBeUndefined();
    });
  });
});
