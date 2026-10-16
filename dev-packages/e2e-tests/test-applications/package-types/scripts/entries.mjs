import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Entries with a real default export. All other entries with types have no default export. */
export const DEFAULT_EXPORT_ENTRIES = new Set([
  '@sentry/astro',
  '@sentry/bundler-plugins/babel-plugin',
  '@sentry/bundler-plugins/esbuild',
  '@sentry/cloudflare/orchestrion-diagnostics-channel',
  '@sentry/esbuild-plugin',
  '@sentry/nuxt/module',
]);

/** Conditions of Node's `import`, Node's `require` and a bundler that builds for the browser. */
const RESOLVERS = {
  nodeImport: ['node', 'import'],
  nodeRequire: ['node', 'require'],
  bundler: ['browser', 'import'],
};

export function getPackageNames() {
  const packageJson = readJson(path.join(APP_DIR, 'package.json'));
  return Object.keys(packageJson.dependencies).filter(name => name.startsWith('@sentry/'));
}

export function getPackageDir(name) {
  return fs.realpathSync(path.join(APP_DIR, 'node_modules', name));
}

export function getPackageJson(name) {
  return readJson(path.join(getPackageDir(name), 'package.json'));
}

/**
 * Lists the exports entries of a package that have types. For each resolver, `formats` holds the module format
 * (`esm` or `cjs`) of the JS file that it loads, or `undefined` if the entry has no JS file for it.
 */
export function getTypedEntries(name) {
  const packageDir = getPackageDir(name);
  const { exports } = getPackageJson(name);

  return Object.entries(exports)
    .filter(([subpath, value]) => subpath !== './package.json' && !subpath.includes('*') && hasTypes(value))
    .map(([subpath, value]) => {
      const specifier = subpath === '.' ? name : `${name}${subpath.slice(1)}`;
      const formats = Object.fromEntries(
        Object.entries(RESOLVERS).map(([resolver, conditions]) => {
          const target = resolveTarget(value, conditions);
          return [resolver, target && getModuleFormat(packageDir, target)];
        }),
      );
      return {
        packageName: name,
        specifier,
        subpath,
        formats,
        hasDefaultExport: DEFAULT_EXPORT_ENTRIES.has(specifier),
      };
    });
}

function hasTypes(value) {
  return (
    !!value && typeof value === 'object' && Object.entries(value).some(([key, v]) => key === 'types' || hasTypes(v))
  );
}

/** Resolves an exports value like Node does, but ignores `types`. */
function resolveTarget(value, conditions) {
  if (typeof value === 'string') {
    return value;
  }

  for (const [key, nested] of Object.entries(value ?? {})) {
    if (key !== 'types' && (key === 'default' || conditions.includes(key))) {
      const target = resolveTarget(nested, conditions);
      if (target !== undefined) {
        return target;
      }
    }
  }

  return undefined;
}

function getModuleFormat(packageDir, target) {
  if (target.endsWith('.mjs')) {
    return 'esm';
  }
  if (target.endsWith('.cjs')) {
    return 'cjs';
  }

  for (let dir = path.dirname(path.join(packageDir, target)); dir.startsWith(packageDir); dir = path.dirname(dir)) {
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return readJson(packageJsonPath).type === 'module' ? 'esm' : 'cjs';
    }
  }

  return 'cjs';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
