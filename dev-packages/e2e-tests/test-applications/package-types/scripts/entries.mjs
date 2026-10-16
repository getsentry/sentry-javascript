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

/** Entries without types: hooks, loaders and files that a build tool injects. All other entries must have types. */
export const JS_ONLY_ENTRIES = new Set([
  '@sentry/astro/import',
  '@sentry/aws-serverless/awslambda-auto',
  '@sentry/aws-serverless/dist/awslambda-auto',
  '@sentry/aws-serverless/import',
  '@sentry/aws-serverless/run-lambda-handler',
  '@sentry/bundler-plugins/sentry-esbuild-debugid-injection-file',
  '@sentry/bundler-plugins/sentry-release-injection-file',
  '@sentry/bundler-plugins/webpack-loader',
  '@sentry/deno/import',
  '@sentry/ember/addon-main.js',
  '@sentry/google-cloud-serverless/import',
  '@sentry/nextjs/async-storage-shim',
  '@sentry/nextjs/import',
  '@sentry/nextjs/orchestrion-runtime/*',
  '@sentry/node-native/event-loop-block-watchdog',
  '@sentry/node/import',
  '@sentry/remix/import',
  '@sentry/remix/v3/node',
  '@sentry/server-runtime-injection/hook',
  '@sentry/server-runtime-injection/import-hook',
  '@sentry/server-utils/orchestrion/webpack-loader',
  '@sentry/tanstackstart-react/import',
]);

/** Published packages that have no types, so this app does not depend on them. */
export const PACKAGES_WITHOUT_TYPES = new Set([
  '@sentry/eslint-config-sdk',
  '@sentry/eslint-plugin-sdk',
  '@sentry/typescript',
]);

/** Conditions of Node's `import`, Node's `require`, a bundler that builds for the browser, and Metro (React Native). */
const RESOLVERS = {
  nodeImport: ['node', 'import'],
  nodeRequire: ['node', 'require'],
  bundler: ['browser', 'import'],
  reactNative: ['react-native', 'import'],
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
 * `hasReactNativeCondition` is true if the entry has a `react-native` condition.
 */
export function getTypedEntries(name) {
  const packageDir = getPackageDir(name);
  const { exports } = getPackageJson(name);

  return Object.entries(exports)
    .filter(
      ([subpath, value]) => subpath !== './package.json' && !subpath.includes('*') && hasCondition(value, 'types'),
    )
    .map(([subpath, value]) => {
      const specifier = toSpecifier(name, subpath);
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
        hasReactNativeCondition: hasCondition(value, 'react-native'),
      };
    });
}

/** Lists the specifiers of the exports entries of a package that have no types. */
export function getEntriesWithoutTypes(name) {
  return Object.entries(getPackageJson(name).exports)
    .filter(([subpath, value]) => subpath !== './package.json' && !hasCondition(value, 'types'))
    .map(([subpath]) => toSpecifier(name, subpath));
}

function toSpecifier(name, subpath) {
  return subpath === '.' ? name : `${name}${subpath.slice(1)}`;
}

function hasCondition(value, condition) {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.entries(value).some(([key, v]) => key === condition || hasCondition(v, condition))
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
