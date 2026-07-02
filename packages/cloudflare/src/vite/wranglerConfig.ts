import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as jsoncParser from 'jsonc-parser';
import TOML from 'smol-toml';

/**
 * The slice of the wrangler configuration the auto-instrument plugin cares
 * about, normalized into a single shape regardless of the source format.
 */
export interface WranglerConfig {
  main?: string;
  durableObjects: Array<{ name: string; className: string }>;
}

/**
 * The raw wrangler config as parsed from disk. Both TOML and JSONC decode to
 * this shape (snake_case keys, `durable_objects.bindings`), matching wrangler's
 * own schema; {@link normalizeWranglerConfig} maps it to {@link WranglerConfig}.
 * Named environments (`[env.<name>]` / `"env"`) repeat the same shape.
 */
interface RawWranglerEnvironment {
  main?: string;
  durable_objects?: { bindings?: Array<{ name: string; class_name: string; script_name?: string }> };
}

interface RawWranglerConfig extends RawWranglerEnvironment {
  env?: Record<string, RawWranglerEnvironment>;
}

/**
 * Locate and parse a wrangler configuration file.
 *
 * When `explicitPath` is provided it is resolved against `root` and used
 * directly. Otherwise the function probes for `wrangler.json`,
 * `wrangler.jsonc` and `wrangler.toml` inside `root` — the same precedence
 * wrangler itself applies, so we read the file wrangler would actually use
 * when more than one exists.
 *
 * Returns `undefined` when no config file exists or the file cannot be parsed
 * (the caller warns and disables auto-instrumentation rather than failing the
 * whole build on a malformed config).
 */
export function resolveWranglerConfig(
  root: string,
  explicitPath?: string,
): { config: WranglerConfig; configDir: string } | undefined {
  if (explicitPath) {
    const filePath = resolve(root, explicitPath);
    if (!existsSync(filePath)) return undefined;
    const config = parseWranglerFile(filePath);
    return config && { config, configDir: dirname(filePath) };
  }

  for (const filename of ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']) {
    const filePath = resolve(root, filename);
    if (existsSync(filePath)) {
      const config = parseWranglerFile(filePath);
      return config && { config, configDir: root };
    }
  }

  return undefined;
}

/**
 * Parse a wrangler config file into the normalized {@link WranglerConfig}.
 *
 * TOML is parsed with `smol-toml` and JSON/JSONC with `jsonc-parser` — the same
 * libraries wrangler itself uses — so comments, trailing commas and the full
 * TOML grammar are handled correctly rather than approximated. Returns
 * `undefined` for empty or unparseable files.
 */
function parseWranglerFile(filePath: string): WranglerConfig | undefined {
  let raw: unknown;
  try {
    const content = readFileSync(filePath, 'utf-8');
    raw = filePath.endsWith('.toml') ? TOML.parse(content) : jsoncParser.parse(content);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  return normalizeWranglerConfig(raw as RawWranglerConfig);
}

function normalizeWranglerConfig(raw: RawWranglerConfig): WranglerConfig {
  // `main` follows the active wrangler environment (selected via CLOUDFLARE_ENV,
  // as `@cloudflare/vite-plugin` does). Durable Object class names are unioned
  // across ALL environments instead: wrapping a class that is only bound in
  // another environment is harmless, while missing one loses instrumentation.
  const activeEnvName = process.env.CLOUDFLARE_ENV;
  const activeEnv = activeEnvName ? raw.env?.[activeEnvName] : undefined;

  const durableObjects: WranglerConfig['durableObjects'] = [];
  const seenClassNames = new Set<string>();
  for (const environment of [raw, ...Object.values(raw.env ?? {})]) {
    for (const binding of environment.durable_objects?.bindings ?? []) {
      // `script_name` bindings reference a class exported by a *different*
      // worker — there is nothing to wrap in this worker's entry file.
      if (typeof binding?.class_name !== 'string' || binding.script_name || seenClassNames.has(binding.class_name)) {
        continue;
      }
      seenClassNames.add(binding.class_name);
      durableObjects.push({ name: binding.name, className: binding.class_name });
    }
  }

  return { main: activeEnv?.main ?? raw.main, durableObjects };
}
