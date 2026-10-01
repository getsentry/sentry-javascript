import * as diagnosticsChannel from 'node:diagnostics_channel';
import { consoleSandbox } from '@sentry/core';
import { remixV3Channels } from '@sentry/server-utils/orchestrion/config';
import { addDebugIdToSourceMap, findDebugId, getDebugId, injectDebugIdSnippet } from './debugId';

// The subset of `@remix-run/assets` types used here. `remix` is an optional peer dependency, so
// they are restated rather than imported.
interface ModuleLoadContext {
  moduleUrl?: string;
  [key: string]: unknown;
}

interface ModuleLoadResult {
  format: string | null | undefined;
  shortCircuit?: boolean;
  source?: string | ArrayBuffer | ArrayBufferView;
}

type ModuleLoader = (
  url: string,
  context: ModuleLoadContext,
  nextLoad: (url: string, context?: Partial<ModuleLoadContext>) => ModuleLoadResult,
) => ModuleLoadResult;

interface AssetServerOptions {
  // `false` is not in Remix's type, but is how an app tells Sentry it wants no source maps at all,
  // since leaving the option out now means hidden source maps.
  sourceMaps?: 'inline' | 'external' | false;
  scripts?: { loaders?: readonly ModuleLoader[]; [key: string]: unknown };
  [key: string]: unknown;
}

interface AssetServer {
  fetch: (request: Request) => Promise<Response | null>;
}

interface CreateAssetServerContext {
  arguments: unknown[];
  result?: unknown;
  _sentryHideSourceMaps?: boolean;
}

// The asset server appends it after minification, so it is always the last line.
const SOURCE_MAPPING_URL_REGEX = /\n\/\/# sourceMappingURL=\S+\s*$/;

const MAX_STAMPED_BODIES = 2000;

let instrumented = false;

/**
 * Makes every Remix 3 asset server created from now on serve browser modules that carry debug IDs.
 *
 * Source maps follow the other meta framework SDKs:
 * - `sourceMaps: false` keeps them off, with a warning that stack traces stay minified.
 * - `'inline'` or `'external'` is kept as the app configured it.
 * - Left out, they are generated but hidden: modules do not reference them and `.map` requests are
 *   not served, so the source only reaches Sentry.
 *
 * Has to run before the app's first `createAssetServer()` call, which usually happens while its
 * modules are imported. `Sentry.init()` is too late for that, so the `@sentry/remix/v3/node` entry
 * calls this.
 */
export function instrumentAssetServer(): void {
  if (instrumented) {
    return;
  }
  instrumented = true;

  // Node rethrows anything a channel subscriber throws as an uncaught exception, which would kill an
  // app that runs fine without Sentry. Frozen options or an unexpected server shape reach here, so
  // the asset server is left as it was instead.
  diagnosticsChannel.tracingChannel(remixV3Channels.REMIX_V3_CREATE_ASSET_SERVER).subscribe({
    start(data) {
      try {
        const context = data as CreateAssetServerContext;
        const options = context.arguments[0] as AssetServerOptions | undefined;
        context._sentryHideSourceMaps = options?.sourceMaps === undefined;
        context.arguments[0] = withDebugIdOptions(options);
      } catch {
        // Ignored on purpose.
      }
    },
    end(data) {
      try {
        const { result, _sentryHideSourceMaps } = data as CreateAssetServerContext;
        if (result) {
          stampServedAssets(result as AssetServer, { hideSourceMaps: Boolean(_sentryHideSourceMaps) });
        }
      } catch {
        // Ignored on purpose.
      }
    },
    asyncStart() {},
    asyncEnd() {},
    error() {},
  });
}

/**
 * Injects the debug ID snippet into every module the asset server compiles.
 *
 * Loaders run after the TypeScript transform and before minification, so the snippet is minified
 * along with the module, and its ID is a hash of the compiled source. The module URL is part of the
 * hash so two identical files get IDs of their own, since their source maps differ.
 */
export const debugIdLoader: ModuleLoader = (url, context, nextLoad) => {
  const result = nextLoad(url, context);
  if (result.format !== 'module' || typeof result.source !== 'string') {
    return result;
  }

  const debugId = getDebugId(`${context.moduleUrl ?? url}\n${result.source}`);
  return { ...result, source: injectDebugIdSnippet(result.source, debugId) };
};

function withDebugIdOptions(options: AssetServerOptions | undefined): AssetServerOptions | undefined {
  if (!options) {
    return options;
  }

  if (options.sourceMaps === false) {
    consoleSandbox(() => {
      // oxlint-disable-next-line no-console
      console.warn(
        '[Sentry] Source maps are disabled in your asset server (`sourceMaps: false`). Sentry will not override this, so client stack traces stay minified.',
      );
    });
  }

  const loaders = options.scripts?.loaders ?? [];

  return {
    ...options,
    // Hidden unless the app chose otherwise, see `stampServedAssets`.
    sourceMaps: options.sourceMaps ?? 'external',
    scripts: {
      ...options.scripts,
      // Last, so the ID also covers whatever the app's own loaders changed.
      loaders: loaders.includes(debugIdLoader) ? loaders : [...loaders, debugIdLoader],
    },
  };
}

/**
 * The minifier drops comments and the asset server rebuilds source maps after the loaders ran, so
 * the `//# debugId=` comment and the source map's `debugId` field, which is what `sentry-cli` reads,
 * are added to the served response instead.
 */
function stampServedAssets(server: AssetServer, { hideSourceMaps }: { hideSourceMaps: boolean }): void {
  const fetchAsset = server.fetch;
  // The asset server memoizes compiled modules and identifies each version by its ETag, so the
  // stamped body is memoized the same way. Without this every hit copied the module body again.
  const stamped = new Map<string, string>();

  server.fetch = async request => {
    const response = await fetchAsset(request);
    if (response?.status !== 200 || request.method !== 'GET') {
      return response;
    }

    const url = new URL(request.url);
    const contentType = response.headers.get('content-type') ?? '';
    const etag = response.headers.get('etag');

    if (contentType.includes('javascript')) {
      return withBody(response, await remember(etag, async () => stampModule(await response.text())));
    }

    if (url.pathname.endsWith('.map')) {
      if (hideSourceMaps) {
        // What the asset server returns for a path it does not serve.
        return null;
      }

      const body = await remember(etag, async () => {
        // A source map does not contain the ID of its module, so it is read from the module itself.
        url.pathname = url.pathname.slice(0, -'.map'.length);
        const moduleResponse = await fetchAsset(new Request(url));
        const debugId = moduleResponse?.ok ? findDebugId(await moduleResponse.text()) : undefined;
        const map = await response.text();
        return debugId ? addDebugIdToSourceMap(map, debugId) : map;
      });
      return withBody(response, body);
    }

    return response;
  };

  function stampModule(served: string): string {
    const code = hideSourceMaps ? served.replace(SOURCE_MAPPING_URL_REGEX, '') : served;
    const debugId = findDebugId(code);
    return debugId ? `${code}\n//# debugId=${debugId}` : code;
  }

  async function remember(etag: string | null, compute: () => Promise<string>): Promise<string> {
    if (etag === null) {
      return compute();
    }
    const cached = stamped.get(etag);
    if (cached !== undefined) {
      return cached;
    }
    const body = await compute();
    // Bounded, because in watch mode every edit is a new ETag.
    if (stamped.size >= MAX_STAMPED_BODIES) {
      stamped.delete(stamped.keys().next().value as string);
    }
    stamped.set(etag, body);
    return body;
  }
}

function withBody(response: Response, body: string): Response {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
