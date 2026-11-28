import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

// Every external dependency here ships to SDK users. Adding one needs SDK team sign-off.
// Peer dependencies count because npm and pnpm install them automatically.
const ALLOWED_DEPENDENCIES = {
  '@sentry/angular': ['@angular/common', '@angular/core', '@angular/router', '@sentry/conventions', 'rxjs', 'tslib'],
  '@sentry/astro': ['@sentry/conventions', 'astro'],
  '@sentry/aws-serverless': ['@sentry/conventions', '@types/aws-lambda'],
  '@sentry/browser': ['@sentry/conventions'],
  '@sentry/browser-utils': ['@sentry/conventions', 'web-vitals'],
  '@sentry/bun': ['@sentry/conventions'],
  '@sentry/bundler-plugins': ['dotenv', 'glob', 'magic-string', 'oxc-parser', 'rollup', 'sentry', 'webpack'],
  '@sentry/cloudflare': [
    '@cloudflare/workers-types',
    '@opentelemetry/api',
    '@sentry/conventions',
    'magic-string',
    'vite',
    'wrangler',
  ],
  '@sentry/core': ['@sentry/conventions'],
  '@sentry/deno': ['@opentelemetry/api', '@sentry/conventions'],
  '@sentry/effect': ['@sentry/conventions', 'effect'],
  '@sentry/elysia': ['@sentry/conventions', 'elysia'],
  '@sentry/ember': ['@embroider/addon-shim', '@embroider/macros', '@sentry/conventions', 'decorator-transforms'],
  '@sentry/eslint-config-sdk': [
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'eslint',
    'eslint-config-prettier',
    'eslint-plugin-deprecation',
    'eslint-plugin-import',
    'eslint-plugin-jsdoc',
    'eslint-plugin-simple-import-sort',
  ],
  '@sentry/gatsby': ['gatsby', 'react'],
  '@sentry/google-cloud-serverless': ['@sentry/conventions', '@types/express'],
  '@sentry/hono': ['@cloudflare/workers-types', '@opentelemetry/api', '@sentry/conventions', 'hono'],
  '@sentry/nestjs': ['@nestjs/common', '@nestjs/core', '@sentry/conventions'],
  '@sentry/nextjs': [
    '@opentelemetry/api',
    '@rollup/plugin-commonjs',
    '@sentry/conventions',
    'next',
    'rollup',
    'stacktrace-parser',
  ],
  '@sentry/nitro': ['@sentry/conventions', 'nitro'],
  '@sentry/node': ['@opentelemetry/api', '@sentry/conventions'],
  '@sentry/node-native': ['@sentry/node-native-stacktrace'],
  '@sentry/nuxt': ['@nuxt/kit', '@sentry/conventions', 'nitro', 'nuxt'],
  '@sentry/opentelemetry': ['@opentelemetry/api', '@sentry/conventions'],
  '@sentry/profiling-node': ['@sentry/conventions', '@sentry/node-cpu-profiler'],
  '@sentry/react': ['@sentry/conventions', 'react', 'react-router'],
  '@sentry/react-router': [
    '@opentelemetry/api',
    '@react-router/node',
    '@sentry/conventions',
    'react',
    'react-router',
    'sentry',
  ],
  '@sentry/remix': [
    '@remix-run/node',
    '@remix-run/react',
    '@remix-run/router',
    '@remix-run/server-runtime',
    '@sentry/conventions',
    'react',
    'remix',
    'sentry',
    'yargs',
  ],
  '@sentry/rollup-plugin': ['rollup'],
  '@sentry/server-utils': ['@opentelemetry/api', '@sentry/conventions'],
  '@sentry/solid': ['@sentry/conventions', '@solidjs/router', '@solidjs/web', '@tanstack/solid-router', 'solid-js'],
  '@sentry/solidstart': ['@sentry/conventions', '@solidjs/router', '@solidjs/start', 'h3'],
  '@sentry/svelte': ['@sentry/conventions', 'magic-string', 'svelte'],
  '@sentry/sveltekit': [
    '@opentelemetry/api',
    '@sentry/conventions',
    '@sveltejs/acorn-typescript',
    '@sveltejs/kit',
    'acorn',
    'magic-string',
    'sorcery',
    'vite',
  ],
  '@sentry/tanstackstart-react': ['@opentelemetry/api', '@sentry/conventions'],
  '@sentry/typescript': ['typescript'],
  '@sentry/vercel-edge': ['@opentelemetry/api'],
  '@sentry/vue': ['@sentry/conventions', '@tanstack/vue-router', 'pinia', 'vue'],
  '@sentry/webpack-plugin': ['webpack'],
};

const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

function readWorkspacePackages() {
  const { workspaces } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return workspaces.map(dir => ({ dir, pkg: JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) }));
}

function getExternalDependencies() {
  const workspacePackages = readWorkspacePackages();
  const workspaceNames = new Set(workspacePackages.map(({ pkg }) => pkg.name));
  const external = new Map();

  for (const { dir, pkg } of workspacePackages) {
    if (!dir.startsWith('packages/') || pkg.private) {
      continue;
    }
    const deps = DEPENDENCY_FIELDS.flatMap(field => Object.keys(pkg[field] || {}));
    external.set(pkg.name, new Set(deps.filter(dep => !workspaceNames.has(dep))));
  }

  return external;
}

describe('SDK package runtime dependencies', () => {
  const external = getExternalDependencies();

  it('only uses allowed external dependencies', () => {
    const unlisted = [...external].flatMap(([name, deps]) =>
      [...deps].filter(dep => !ALLOWED_DEPENDENCIES[name]?.includes(dep)).map(dep => `${name} -> ${dep}`),
    );
    expect(
      unlisted,
      'New runtime dependencies ship to SDK users. Avoid them, or add them to ALLOWED_DEPENDENCIES in ' +
        'scripts/runtime-dependencies.test.mjs with SDK team sign-off.',
    ).toEqual([]);
  });

  it('has no allowlist entries for removed dependencies', () => {
    const stale = Object.entries(ALLOWED_DEPENDENCIES).flatMap(([name, deps]) =>
      deps.filter(dep => !external.get(name)?.has(dep)).map(dep => `${name} -> ${dep}`),
    );
    expect(stale, 'Remove these entries from ALLOWED_DEPENDENCIES in scripts/runtime-dependencies.test.mjs.').toEqual(
      [],
    );
  });
});
