import type { Plugin, Rollup } from 'vite';
import { logDebug, NITRO_ENVIRONMENT, type NitroOptions } from './nitroSourceMaps';

const PRELOAD_MODULE_ID = '#sentry/tanstackstart-react/preload-server-entry';
const RESOLVED_PRELOAD_MODULE_ID = `\0${PRELOAD_MODULE_ID}`;

// The module that imports the service entries lazily. Nitro renamed it, so this lists the names, newest first.
const NITRO_SERVICES_MODULE_IDS = ['#nitro/virtual/vite-services', '#nitro-vite-setup'];

// Replaced with the services to await once the module graph is complete. Left as is, no service is awaited.
const AWAITED_SERVICES_PLACEHOLDER = '__SENTRY_PRELOAD_AWAITED_SERVICES__';

// A safety net against an import cycle that the build could not detect, which would otherwise never settle.
const PRELOAD_TIMEOUT_MS = 3000;

type Nitro = { options: Pick<NitroOptions, 'dev' | 'node' | 'plugins'> };

type ModuleGraph = Pick<Rollup.PluginContext, 'getModuleInfo'>;

/**
 * Nitro imports the entry of a Vite service, such as TanStack Start's server entry, on the first request. An
 * `instrument.server` import at the top of the server entry so only initializes the SDK during that request, too late
 * for the HTTP instrumentation to see it. This adds a Nitro plugin that imports the service entries at server startup.
 */
export function makePreloadNitroServerEntryPlugin({ debug }: { debug?: boolean }): Plugin & {
  nitro: { name: string; setup: (nitro: Nitro) => void };
} {
  let serviceEntryIds: string[] = [];

  return {
    name: 'sentry-tanstackstart-nitro-preload-server-entry',
    apply: 'build',
    enforce: 'pre',
    applyToEnvironment: environment => environment.name === NITRO_ENVIRONMENT,
    resolveId(id) {
      return id === PRELOAD_MODULE_ID ? RESOLVED_PRELOAD_MODULE_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_PRELOAD_MODULE_ID) {
        return null;
      }

      const entries = await loadServiceEntries(this);
      serviceEntryIds = await Promise.all(entries.map(async entry => (await this.resolve(entry, id))?.id ?? entry));
      logDebug(
        debug,
        entries.length > 0
          ? `Loading the Nitro service entries at server startup: ${entries.join(', ')}`
          : 'Found no Nitro service entries to load at server startup.',
      );
      return renderPreloadModule(entries, debug);
    },
    renderChunk(code, chunk) {
      if (!chunk.moduleIds.includes(RESOLVED_PRELOAD_MODULE_ID)) {
        return null;
      }

      const awaited = serviceEntryIds.map(entryId => !importsModule(this, entryId, RESOLVED_PRELOAD_MODULE_ID));
      serviceEntryIds.forEach((entryId, index) => {
        if (!awaited[index]) {
          logDebug(
            debug,
            `Not waiting for ${entryId} at server startup, as it imports the Nitro runtime. The first request may not be traced on serverless platforms.`,
          );
        }
      });
      // Only the rest of the placeholder's line moves, so the source map can stay as is.
      return { code: setAwaitedServices(code, awaited), map: null };
    },
    nitro: {
      name: 'sentry-tanstackstart-nitro-preload-server-entry',
      setup(nitro) {
        // Workers have no Node.js HTTP server to instrument, and in dev Nitro loads the services through Vite.
        if (nitro.options.dev || nitro.options.node === false) {
          logDebug(debug, 'Not loading the Nitro service entries at server startup in dev or without Node.js.');
          return;
        }
        nitro.options.plugins.push(PRELOAD_MODULE_ID);
      },
    },
  };
}

/**
 * Reads the service entries from the module that Nitro generates to import them lazily. Importing the very same
 * specifiers makes the bundler load the same modules, rather than a second copy of the SDK. If the module changes
 * shape, nothing is preloaded.
 */
async function loadServiceEntries(context: Pick<Rollup.PluginContext, 'resolve' | 'load'>): Promise<string[]> {
  for (const id of NITRO_SERVICES_MODULE_IDS) {
    const resolved = await context.resolve(id);
    if (resolved && !resolved.external) {
      const { code } = await context.load(resolved);
      return parseServiceEntries(code ?? '');
    }
  }
  return [];
}

export function parseServiceEntries(code: string): string[] {
  const entries = [];
  for (const [, entry] of code.matchAll(/\]: lazyService\(\(\) => import\(("(?:[^"\\]|\\.)*")\)\)/g)) {
    if (entry) {
      entries.push(JSON.parse(entry) as string);
    }
  }
  return entries;
}

/**
 * Whether a module statically imports the target, directly or through other modules. A service entry that imports the
 * preload module would wait for it at startup, while the preload module waits for the entry.
 */
export function importsModule(graph: ModuleGraph, moduleId: string, targetId: string): boolean {
  const seen = new Set<string>();
  const queue = [moduleId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (id === targetId) {
      return true;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const info = graph.getModuleInfo(id);
    if (!info) {
      // Without the imports of a module, assume the worst.
      return true;
    }
    queue.push(...info.importedIds);
  }
  return false;
}

/**
 * Serverless platforms send the first request right after loading the Nitro server module, so the preload has to
 * finish before the module does, with top-level `await`. Which services are awaited is only known after the build.
 */
export function renderPreloadModule(entries: string[], debug?: boolean): string {
  if (entries.length === 0) {
    return 'export default function sentryPreloadServerEntry() {}';
  }

  // Errors surface when Nitro imports the entry for the first request, as without the preload.
  const onError = debug
    ? `error => console.warn(${JSON.stringify('[Sentry] Loading a Nitro service entry at server startup failed:')}, error)`
    : '() => {}';

  return [
    `const preloads = [${entries.map(entry => `import(${JSON.stringify(entry)}).catch(${onError})`).join(', ')}];`,
    `const awaitedServices = ${JSON.stringify(AWAITED_SERVICES_PLACEHOLDER)};`,
    'const awaited = preloads.filter((_, index) => awaitedServices[index] === true);',
    'if (awaited.length > 0) {',
    '  let loaded = false;',
    '  let timeout;',
    `  await Promise.race([Promise.all(awaited).then(() => { loaded = true; }), new Promise(resolve => { timeout = setTimeout(resolve, ${PRELOAD_TIMEOUT_MS}); })]);`,
    '  clearTimeout(timeout);',
    `  if (!loaded) console.warn(${JSON.stringify(
      `[Sentry] Loading the server entry at server startup took longer than ${PRELOAD_TIMEOUT_MS}ms and continues in the background. The first request may not be traced.`,
    )});`,
    '}',
    'export default function sentryPreloadServerEntry() {}',
  ].join('\n');
}

export function setAwaitedServices(code: string, awaited: boolean[]): string {
  return code.replace(new RegExp(`(["'])${AWAITED_SERVICES_PLACEHOLDER}\\1`), JSON.stringify(awaited));
}
