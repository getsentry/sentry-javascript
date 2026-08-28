import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Unstable_Config, unstable_readConfig } from 'wrangler';
import { DEFAULT_EXPORT, type ExportName, type SameWorkerBinding } from './bindings';

export { DEFAULT_EXPORT, type ExportName, type SameWorkerBinding };

/**
 * The slice of the wrangler configuration the auto-instrument plugin cares
 * about. `main` is an absolute path (wrangler resolves it against the config
 * file's directory).
 */
export interface WranglerConfig {
  main?: string;
  durableObjects: Array<{ name: string; className: string }>;
  workflows: Array<{ name: string; className: string }>;
  /**
   * Named `WorkerEntrypoint` exports this worker binds to itself via a service
   * binding (`services[]` whose `service` is this worker's own `name`). Only
   * self-bindings appear here: a service binding's `entrypoint` otherwise names
   * an export on a *different* worker, which this build can't wrap.
   */
  workerEntrypoints: string[];
  /**
   * Bindings whose RPC receiver lives in this worker, so this build instruments it. Not deduped by
   * class, two bindings may point at the same class and both names have to be listed.
   */
  sameWorkerBindings: SameWorkerBinding[];
}

/**
 * Locate and resolve the wrangler configuration via wrangler's own
 * `unstable_readConfig` — the API `@cloudflare/vite-plugin` uses.
 *
 * We only locate the file (probing `wrangler.json`, `.jsonc`, `.toml` inside
 * `root` with wrangler's own precedence, since it discovers from `cwd` rather
 * than an arbitrary root); wrangler then parses it, flattens the active
 * environment (honoring `CLOUDFLARE_ENV`), and resolves `main` to an absolute
 * path. Durable Object and Workflow bindings are the active environment's,
 * matching what the deployed Worker actually binds.
 *
 * Returns `undefined` when no config file is found or it can't be read/parsed
 * (the caller warns and disables auto-instrumentation rather than failing the
 * whole build).
 */
export function resolveWranglerConfig(
  root: string,
  explicitPath?: string,
): { config: WranglerConfig; configDir: string } | undefined {
  const configPath = explicitPath
    ? resolve(root, explicitPath)
    : ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'].map(name => resolve(root, name)).find(existsSync);

  if (!configPath || !existsSync(configPath)) {
    return undefined;
  }

  let raw: Unstable_Config;
  try {
    // `hideWarnings` keeps wrangler's config diagnostics (e.g. missing DO
    // migrations) out of the Vite build output.
    raw = unstable_readConfig({ config: configPath }, { hideWarnings: true });
  } catch {
    return undefined;
  }

  return {
    config: {
      main: raw.main,
      durableObjects: collectClassBindings(raw.durable_objects?.bindings),
      workflows: collectClassBindings(raw.workflows),
      workerEntrypoints: collectSelfBoundEntrypoints(raw),
      sameWorkerBindings: collectSameWorkerBindings(raw),
    },
    configDir: dirname(raw.configPath ?? configPath),
  };
}

/**
 * Collect named `WorkerEntrypoint` exports the worker binds to itself. A service
 * binding's `entrypoint` normally names an export on the *target* worker, so it
 * is only ours when `service` equals this worker's own `name`. Without a `name`
 * there is nothing to match against, so no entrypoints are derivable.
 */
function collectSelfBoundEntrypoints(raw: Unstable_Config): string[] {
  if (!raw.name) {
    return [];
  }
  const entrypoints = new Set<string>();
  for (const binding of raw.services ?? []) {
    if (binding?.service === raw.name && typeof binding.entrypoint === 'string') {
      entrypoints.add(binding.entrypoint);
    }
  }
  return [...entrypoints];
}

/**
 * Bindings with a `script_name` or naming another worker target a class this build does not wrap,
 * so they are excluded and stay opt-in.
 */
function collectSameWorkerBindings(raw: Unstable_Config): SameWorkerBinding[] {
  const bindings: SameWorkerBinding[] = [];

  for (const binding of raw.durable_objects?.bindings ?? []) {
    if (typeof binding?.name === 'string' && typeof binding.class_name === 'string' && !binding.script_name) {
      bindings.push({ bindingName: binding.name, className: binding.class_name });
    }
  }

  for (const binding of raw.services ?? []) {
    // A service binding is only ours when `service` names this worker; without a `name` none can be.
    if (raw.name && binding?.service === raw.name && typeof binding.binding === 'string') {
      bindings.push({
        bindingName: binding.binding,
        className: typeof binding.entrypoint === 'string' ? binding.entrypoint : DEFAULT_EXPORT,
      });
    }
  }

  return bindings;
}

/**
 * Map wrangler class bindings (Durable Objects, Workflows — same shape) to the
 * `{ name, className }` the transform needs, skipping duplicates and bindings
 * with a `script_name` (those reference a class exported by a *different*
 * worker, so there is nothing to wrap in this worker's entry file).
 */
function collectClassBindings(
  bindings: ReadonlyArray<{ name: string; class_name?: string; script_name?: string }> | undefined,
): Array<{ name: string; className: string }> {
  const result: Array<{ name: string; className: string }> = [];
  const seenClassNames = new Set<string>();
  for (const binding of bindings ?? []) {
    if (typeof binding?.class_name !== 'string' || binding.script_name || seenClassNames.has(binding.class_name)) {
      continue;
    }
    seenClassNames.add(binding.class_name);
    result.push({ name: binding.name, className: binding.class_name });
  }
  return result;
}
