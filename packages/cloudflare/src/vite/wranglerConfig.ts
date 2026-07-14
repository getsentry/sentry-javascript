import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Unstable_Config, unstable_readConfig } from 'wrangler';

/**
 * The slice of the wrangler configuration the auto-instrument plugin cares
 * about. `main` is an absolute path (wrangler resolves it against the config
 * file's directory).
 */
export interface WranglerConfig {
  main?: string;
  durableObjects: Array<{ name: string; className: string }>;
}

/**
 * Locate and resolve the wrangler configuration via wrangler's own
 * `unstable_readConfig` — the API `@cloudflare/vite-plugin` uses.
 *
 * We only locate the file (probing `wrangler.json`, `.jsonc`, `.toml` inside
 * `root` with wrangler's own precedence, since it discovers from `cwd` rather
 * than an arbitrary root); wrangler then parses it, flattens the active
 * environment (honoring `CLOUDFLARE_ENV`), and resolves `main` to an absolute
 * path. Durable Object bindings are the active environment's, matching what the
 * deployed Worker actually binds.
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

  const durableObjects: WranglerConfig['durableObjects'] = [];
  const seenClassNames = new Set<string>();
  for (const binding of raw.durable_objects?.bindings ?? []) {
    // `script_name` bindings reference a class exported by a *different* worker
    // — there is nothing to wrap in this worker's entry file.
    if (typeof binding?.class_name !== 'string' || binding.script_name || seenClassNames.has(binding.class_name)) {
      continue;
    }
    seenClassNames.add(binding.class_name);
    durableObjects.push({ name: binding.name, className: binding.class_name });
  }

  return {
    config: { main: raw.main, durableObjects },
    configDir: dirname(raw.configPath ?? configPath),
  };
}
