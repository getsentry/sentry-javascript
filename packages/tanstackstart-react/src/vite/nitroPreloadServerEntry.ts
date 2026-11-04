import type { Plugin } from 'vite';
import { isNitroService } from './nitroSourceMaps';

const PRELOAD_PLUGIN_ID = '#sentry/tanstackstart-react/preload-server-entry';
const VITE_SERVICES_ID = '#nitro/virtual/vite-services';

// A safety net against an import cycle that the build could not detect, which would otherwise never settle.
const PRELOAD_TIMEOUT_MS = 3000;

type NitroTemplate = string | (() => string | Promise<string>);

type Nitro = {
  options: {
    dev: boolean;
    node: boolean;
    plugins: string[];
    virtual: Record<string, NitroTemplate>;
  };
};

type ServiceEntry = { file: string; importsNitroRuntime: boolean };

/**
 * Nitro imports the entry of a Vite service, such as TanStack Start's server entry, on the first request. An
 * `instrument.server` import at the top of the server entry so only initializes the SDK during that request, too late
 * for the HTTP instrumentation to see it. This adds a Nitro plugin that imports the service entries at server startup.
 */
export function makePreloadNitroServerEntryPlugin(): Plugin & {
  nitro: { name: string; setup: (nitro: Nitro) => void };
} {
  const servicesImportingNitroRuntime = new Map<string, boolean>();

  return {
    name: 'sentry-tanstackstart-nitro-preload-server-entry',
    apply: 'build',
    applyToEnvironment: isNitroService,
    writeBundle(_outputOptions, bundle) {
      const importsNitroRuntime = Object.values(bundle).some(
        output => output.type === 'chunk' && [...output.imports, ...output.dynamicImports].some(isNitroRuntimeImport),
      );
      servicesImportingNitroRuntime.set(this.environment.name, importsNitroRuntime);
    },
    nitro: {
      name: 'sentry-tanstackstart-nitro-preload-server-entry',
      setup(nitro) {
        // Workers have no Node.js HTTP server to instrument, and in dev Nitro loads the services through Vite.
        if (nitro.options.dev || nitro.options.node === false) {
          return;
        }

        // Nitro renders the templates when it builds its own environment, after the service environments.
        nitro.options.virtual[PRELOAD_PLUGIN_ID] = async () => {
          const services = await readViteServices(nitro.options.virtual[VITE_SERVICES_ID]);
          return renderPreloadPlugin(
            services.map(({ name, file }) => ({
              file,
              // A service that was not checked could import the Nitro runtime.
              importsNitroRuntime: servicesImportingNitroRuntime.get(name) ?? true,
            })),
          );
        };
        nitro.options.plugins.push(PRELOAD_PLUGIN_ID);
      },
    },
  };
}

/**
 * Reads the services and the entry files that Nitro imports lazily from its internal `vite-services` module. Importing
 * the very same specifiers makes the bundler load the same modules, rather than a second copy of the SDK. If the module
 * changes shape, nothing is preloaded.
 */
export async function readViteServices(template: NitroTemplate | undefined): Promise<{ name: string; file: string }[]> {
  const code = typeof template === 'function' ? await template() : template;
  if (!code) {
    return [];
  }

  const services = [];
  for (const [, name, file] of code.matchAll(
    /\[("(?:[^"\\]|\\.)*")\]: lazyService\(\(\) => import\(("(?:[^"\\]|\\.)*")\)\)/g,
  )) {
    if (name && file) {
      services.push({ name: JSON.parse(name) as string, file: JSON.parse(file) as string });
    }
  }
  return services;
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

function isNitroRuntimeImport(id: string): boolean {
  return (
    id === 'nitro' || id.startsWith('nitro/') || id.startsWith('#nitro/') || /[\\/]node_modules[\\/]nitro[\\/]/.test(id)
  );
}
