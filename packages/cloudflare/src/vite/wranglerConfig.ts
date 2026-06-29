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
 */
interface RawWranglerConfig {
  main?: string;
  durable_objects?: { bindings?: Array<{ name: string; class_name: string }> };
}

/**
 * Locate and parse a wrangler configuration file.
 *
 * When `explicitPath` is provided it is used directly. Otherwise the function
 * probes for `wrangler.toml`, `wrangler.json` and `wrangler.jsonc` inside
 * `root`, in that order.
 */
export function resolveWranglerConfig(
  root: string,
  explicitPath?: string,
): { config: WranglerConfig; configDir: string } | undefined {
  if (explicitPath) {
    if (!existsSync(explicitPath)) return undefined;
    return { config: parseWranglerFile(explicitPath), configDir: dirname(explicitPath) };
  }

  for (const filename of ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']) {
    const filePath = resolve(root, filename);
    if (existsSync(filePath)) {
      return { config: parseWranglerFile(filePath), configDir: root };
    }
  }

  return undefined;
}

/**
 * Parse a wrangler config file into the normalized {@link WranglerConfig}.
 *
 * TOML is parsed with `smol-toml` and JSON/JSONC with `jsonc-parser` — the same
 * libraries wrangler itself uses — so comments, trailing commas and the full
 * TOML grammar are handled correctly rather than approximated.
 */
function parseWranglerFile(filePath: string): WranglerConfig {
  const content = readFileSync(filePath, 'utf-8');
  const raw = (filePath.endsWith('.toml') ? TOML.parse(content) : jsoncParser.parse(content)) as RawWranglerConfig;
  return normalizeWranglerConfig(raw);
}

function normalizeWranglerConfig(raw: RawWranglerConfig): WranglerConfig {
  return {
    main: raw.main,
    durableObjects: (raw.durable_objects?.bindings ?? []).map(binding => ({
      name: binding.name,
      className: binding.class_name,
    })),
  };
}
