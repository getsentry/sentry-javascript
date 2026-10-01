import * as diagnosticsChannel from 'node:diagnostics_channel';
import { remixV3Channels } from '@sentry/server-utils/orchestrion/config';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { debugIdLoader, instrumentAssetServer } from '../../src/v3/assetServer';
import { getDebugId, getDebugIdSnippet } from '../../src/v3/debugId';

type Options = Record<string, any>;
type FakeFetch = (request: Request) => Promise<Response | null>;

const channel = diagnosticsChannel.tracingChannel(remixV3Channels.REMIX_V3_CREATE_ASSET_SERVER);

// Stands in for orchestrion's transform, which calls the original with the channel context's
// `arguments`, so subscribers can replace them.
function createAssetServer(options: Options, fetch: FakeFetch = async () => null) {
  const context = { arguments: [options] as unknown[] };
  let receivedOptions: Options | undefined;

  const server = channel.traceSync(() => {
    receivedOptions = context.arguments[0] as Options;
    return { fetch };
  }, context);

  return { server, receivedOptions: receivedOptions as Options };
}

function javascript(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'application/javascript; charset=utf-8', etag: 'W/"a"' } });
}

describe('instrumentAssetServer', () => {
  beforeAll(() => {
    instrumentAssetServer();
  });

  describe('options', () => {
    it('generates source maps when the app did not configure them', () => {
      const { receivedOptions } = createAssetServer({ basePath: '/assets' });

      expect(receivedOptions.sourceMaps).toBe('external');
    });

    it('keeps source maps the app configured', () => {
      const { receivedOptions } = createAssetServer({ basePath: '/assets', sourceMaps: 'inline' });

      expect(receivedOptions.sourceMaps).toBe('inline');
    });

    it('keeps source maps off when the app disabled them, and warns', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { receivedOptions } = createAssetServer({ basePath: '/assets', sourceMaps: false });

      expect(receivedOptions.sourceMaps).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Source maps are disabled in your asset server'));
      warn.mockRestore();
    });

    it('adds the debug ID loader after the app loaders', () => {
      const appLoader = vi.fn();
      const { receivedOptions } = createAssetServer({ scripts: { loaders: [appLoader], define: { a: 'b' } } });

      expect(receivedOptions.scripts).toEqual({ loaders: [appLoader, debugIdLoader], define: { a: 'b' } });
    });

    it('does not mutate the options the app passed', () => {
      const options = { basePath: '/assets' };
      createAssetServer(options);

      expect(options).toEqual({ basePath: '/assets' });
    });

    it('adds the loader once when the same options are reused', () => {
      const first = createAssetServer({}).receivedOptions;
      const { receivedOptions } = createAssetServer(first);

      expect(receivedOptions.scripts.loaders).toEqual([debugIdLoader]);
    });
  });

  describe('debugIdLoader', () => {
    it('injects a snippet whose ID hashes the module URL and its compiled source', () => {
      const result = debugIdLoader('file:///app/entry.ts', { moduleUrl: '/assets/app/entry.ts' }, () => ({
        format: 'module',
        source: 'export const a = 1;',
      }));

      const debugId = getDebugId('/assets/app/entry.ts\nexport const a = 1;');
      expect(result.source).toBe(`${getDebugIdSnippet(debugId)}\nexport const a = 1;`);
    });

    it('gives identical modules at different URLs different IDs', () => {
      const load = () => ({ format: 'module', source: 'export const a = 1;' });

      const first = debugIdLoader('file:///app/a.ts', { moduleUrl: '/assets/app/a.ts' }, load);
      const second = debugIdLoader('file:///app/b.ts', { moduleUrl: '/assets/app/b.ts' }, load);

      expect(first.source).not.toBe(second.source);
    });
  });

  describe('served assets', () => {
    const debugId = getDebugId('module');
    const moduleCode = `${getDebugIdSnippet(debugId)}export const a=1;\n//# sourceMappingURL=/assets/app/entry.ts.map`;

    function createServer(options: Options = { sourceMaps: 'external' }) {
      const fetch = vi.fn<FakeFetch>(async request => {
        const { pathname } = new URL(request.url);
        if (pathname === '/assets/app/entry.ts') {
          return javascript(moduleCode);
        }
        if (pathname === '/assets/app/entry.ts.map') {
          return new Response('{"version":3,"mappings":"AAAA"}', { headers: { 'content-type': 'application/json' } });
        }
        if (pathname === '/assets/app/plain.js') {
          return javascript('export const b=1;');
        }
        return null;
      });

      return { server: createAssetServer(options, fetch).server, fetch };
    }

    it('appends the debugId comment to modules', async () => {
      const { server } = createServer();

      const response = await server.fetch(new Request('http://localhost/assets/app/entry.ts'));

      expect(await response?.text()).toBe(`${moduleCode}\n//# debugId=${debugId}`);
      expect(response?.headers.get('etag')).toBe('W/"a"');
    });

    it('adds the debug ID of the module to its source map', async () => {
      const { server } = createServer();

      const response = await server.fetch(new Request('http://localhost/assets/app/entry.ts.map'));

      expect(await response?.json()).toEqual({ version: 3, mappings: 'AAAA', debugId, debug_id: debugId });
    });

    describe('when the app did not configure source maps', () => {
      it('does not reference the source map from modules', async () => {
        const { server } = createServer({});

        const response = await server.fetch(new Request('http://localhost/assets/app/entry.ts'));

        expect(await response?.text()).toBe(`${getDebugIdSnippet(debugId)}export const a=1;\n//# debugId=${debugId}`);
      });

      it('does not serve source maps', async () => {
        const { server } = createServer({});

        expect(await server.fetch(new Request('http://localhost/assets/app/entry.ts.map'))).toBeNull();
      });
    });

    describe('memoizes by ETag', () => {
      // The asset server serves the same compiled module under the same ETag until the file changes,
      // so the stamped body is computed once per version, not copied on every hit.
      function createRecordingServer(bodies: string[] = [moduleCode, moduleCode]) {
        const served: Response[] = [];
        let n = 0;
        const fetch: FakeFetch = async request => {
          const { pathname } = new URL(request.url);
          if (pathname === '/assets/app/entry.ts') {
            const body = bodies[Math.min(n++, bodies.length - 1)] as string;
            // As the real server does: a new body gets a new ETag, the same body keeps its ETag.
            const response = new Response(body, {
              headers: { 'content-type': 'application/javascript', etag: `W/"${bodies.indexOf(body)}"` },
            });
            served.push(response);
            return response;
          }
          if (pathname === '/assets/app/entry.ts.map') {
            return new Response('{"version":3,"mappings":"AAAA"}', {
              headers: { 'content-type': 'application/json', etag: 'W/"m"' },
            });
          }
          return null;
        };
        const fetchSpy = vi.fn(fetch);
        return { server: createAssetServer({ sourceMaps: 'external' }, fetchSpy).server, served, fetchSpy };
      }

      it('reads a module body once per ETag', async () => {
        const { server, served } = createRecordingServer();

        const first = await (await server.fetch(new Request('http://localhost/assets/app/entry.ts')))?.text();
        const second = await (await server.fetch(new Request('http://localhost/assets/app/entry.ts')))?.text();

        expect(second).toBe(first);
        expect(served.map(response => response.bodyUsed)).toEqual([true, false]);
      });

      it('reads the module once for a source map served under the same ETag', async () => {
        const { server, fetchSpy } = createRecordingServer();

        await server.fetch(new Request('http://localhost/assets/app/entry.ts.map'));
        await server.fetch(new Request('http://localhost/assets/app/entry.ts.map'));

        // Two map requests, and the module looked up only for the first.
        expect(fetchSpy).toHaveBeenCalledTimes(3);
      });

      it('stamps a changed module again', async () => {
        const changedId = getDebugId('changed');
        const changed = `${getDebugIdSnippet(changedId)}export const a=2;`;
        const { server, served } = createRecordingServer([moduleCode, changed]);

        await server.fetch(new Request('http://localhost/assets/app/entry.ts'));
        const second = await server.fetch(new Request('http://localhost/assets/app/entry.ts'));

        expect(await second?.text()).toBe(`${changed}\n//# debugId=${changedId}`);
        expect(served.map(response => response.bodyUsed)).toEqual([true, true]);
      });
    });

    it('leaves modules without a snippet unchanged', async () => {
      const { server } = createServer();

      const response = await server.fetch(new Request('http://localhost/assets/app/plain.js'));

      expect(await response?.text()).toBe('export const b=1;');
    });

    it('passes through requests the asset server does not handle', async () => {
      const { server } = createServer();

      expect(await server.fetch(new Request('http://localhost/other'))).toBeNull();
    });

    it('leaves HEAD requests alone', async () => {
      const { server, fetch } = createServer();
      const request = new Request('http://localhost/assets/app/entry.ts', { method: 'HEAD' });

      await server.fetch(request);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(request);
    });
  });
});
