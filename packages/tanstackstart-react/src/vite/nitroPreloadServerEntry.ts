import * as path from 'node:path';
import type { Plugin, Rollup } from 'vite';
import { isNitroService } from './nitroSourceMaps';

const PRELOAD_PLUGIN_ID = '#sentry/tanstackstart-react/preload-server-entry';

// A safety net against an import cycle that the build could not detect, which would otherwise never settle.
const PRELOAD_TIMEOUT_MS = 3000;

type Nitro = {
  options: {
    dev: boolean;
    node: boolean;
    plugins: string[];
    virtual: Record<string, string | (() => string | Promise<string>)>;
  };
};

type ServiceEntry = { file: string; importsNitroRuntime: boolean };

/**
 * Nitro imports the entry of a Vite service, such as TanStack Start's server entry, on the first request. An
 * `instrument.server` import at the top of the server entry so only initializes the SDK during that request, too late
 * for the HTTP instrumentation to see it. This adds a Nitro plugin that imports the service entries at server startup.
 *
 * Because the plugin imports the same files that Nitro imports lazily, the SDK is not bundled a second time.
 */
export function makePreloadNitroServerEntryPlugin(): Plugin & {
  nitro: { name: string; setup: (nitro: Nitro) => void };
} {
  const serviceEntries = new Map<string, ServiceEntry[]>();

  return {
    name: 'sentry-tanstackstart-nitro-preload-server-entry',
    apply: 'build',
    applyToEnvironment: isNitroService,
    writeBundle(outputOptions, bundle) {
      if (!outputOptions.dir) {
        return;
      }

      const chunks = Object.values(bundle).filter((output): output is Rollup.OutputChunk => output.type === 'chunk');
      const importsNitroRuntime = chunks.some(chunk =>
        [...chunk.imports, ...chunk.dynamicImports].some(isNitroRuntimeImport),
      );
      const entryChunk = findServiceEntryChunk(chunks, this.environment.config.build.rolldownOptions.input);
      if (!entryChunk) {
        return;
      }

      // Nitro imports the entry by a forward-slash path, so the bundler sees one module rather than two copies.
      const file = path.resolve(outputOptions.dir, entryChunk.fileName).replace(/\\/g, '/');
      serviceEntries.set(this.environment.name, [{ file, importsNitroRuntime }]);
    },
    nitro: {
      name: 'sentry-tanstackstart-nitro-preload-server-entry',
      setup(nitro) {
        // Workers have no Node.js HTTP server to instrument, and in dev Nitro loads the services through Vite.
        if (nitro.options.dev || nitro.options.node === false) {
          return;
        }

        // Nitro renders the template when it builds its own environment, after the service environments.
        nitro.options.virtual[PRELOAD_PLUGIN_ID] = () => renderPreloadPlugin([...serviceEntries.values()].flat());
        nitro.options.plugins.push(PRELOAD_PLUGIN_ID);
      },
    },
  };
}

/**
 * Serverless platforms send the first request right after loading the Nitro server module, so the preload has to
 * finish before the module does, with top-level `await`.
 *
 * A service that imports the Nitro runtime depends on this plugin, though, and awaiting it would never settle. Such
 * services are imported without waiting, which on serverless platforms can still lose the race with the first request.
 */
export function renderPreloadPlugin(entries: ServiceEntry[]): string {
  const awaited = entries.filter(entry => !entry.importsNitroRuntime);
  const notAwaited = entries.filter(entry => entry.importsNitroRuntime);
  const lines: string[] = [];

  if (awaited.length > 0) {
    lines.push(
      'let loaded = false;',
      `const preload = Promise.all([${awaited.map(entry => renderImport(entry.file)).join(', ')}]).then(() => { loaded = true; });`,
      'let timeout;',
      `await Promise.race([preload, new Promise(resolve => { timeout = setTimeout(resolve, ${PRELOAD_TIMEOUT_MS}); })]);`,
      'clearTimeout(timeout);',
      `if (!loaded) console.warn(${JSON.stringify(
        `[Sentry] Loading the server entry at server startup took longer than ${PRELOAD_TIMEOUT_MS}ms and continues in the background. The first request may not be traced.`,
      )});`,
    );
  }

  lines.push(...notAwaited.map(entry => `${renderImport(entry.file)};`));
  lines.push('export default function sentryPreloadServerEntry() {}');

  return lines.join('\n');
}

// Errors surface when Nitro imports the entry for the first request, as without the preload.
function renderImport(file: string): string {
  return `import(${JSON.stringify(file)}).catch(() => {})`;
}

/** The chunk that Nitro picks as the entry of a service: the one of the build input, or else the first. */
function findServiceEntryChunk(
  chunks: Rollup.OutputChunk[],
  input: Rollup.InputOption | undefined,
): Rollup.OutputChunk | undefined {
  const entryChunks = chunks.filter(chunk => chunk.isEntry);
  const inputs = (typeof input === 'string' ? [input] : Object.values(input ?? {})).map(file => path.resolve(file));

  return (
    entryChunks.find(chunk => chunk.facadeModuleId && inputs.includes(path.resolve(chunk.facadeModuleId))) ??
    entryChunks[0]
  );
}

function isNitroRuntimeImport(id: string): boolean {
  return (
    id === 'nitro' || id.startsWith('nitro/') || id.startsWith('#nitro/') || /[\\/]node_modules[\\/]nitro[\\/]/.test(id)
  );
}
