import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

const BASE_PACKAGES = ['@sentry/core', '@sentry/browser', '@sentry/browser-utils'];

// Every external runtime dependency ships to every browser SDK user. Adding one here needs SDK team sign-off.
const ALLOWED_DEPENDENCIES = ['@sentry/conventions', 'web-vitals'];

const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

function readWorkspacePackages() {
  const { workspaces } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const packages = new Map();
  for (const dir of workspaces) {
    const pkg = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'));
    packages.set(pkg.name, pkg);
  }
  return packages;
}

function findDisallowedDependencies(packages, roots, allowed) {
  const violations = [];
  const visited = new Set();
  const queue = roots.map(name => [name]);

  while (queue.length) {
    const path = queue.shift();
    const name = path[path.length - 1];
    if (visited.has(name)) {
      continue;
    }
    visited.add(name);

    const pkg = packages.get(name);
    for (const field of DEPENDENCY_FIELDS) {
      for (const dep of Object.keys(pkg[field] || {})) {
        if (packages.has(dep)) {
          queue.push([...path, dep]);
        } else if (!allowed.includes(dep)) {
          violations.push(`${[...path, dep].join(' -> ')} (${field})`);
        }
      }
    }
  }

  return violations;
}

describe('base SDK dependencies', () => {
  it('only uses allowed external runtime dependencies', () => {
    const violations = findDisallowedDependencies(readWorkspacePackages(), BASE_PACKAGES, ALLOWED_DEPENDENCIES);
    expect(
      violations,
      'New runtime dependencies on the base SDK path ship to every browser SDK user. ' +
        'Avoid them, or add them to ALLOWED_DEPENDENCIES in scripts/base-sdk-dependencies.test.mjs with SDK team sign-off.',
    ).toEqual([]);
  });

  it('reports external dependencies of nested workspace packages', () => {
    const packages = new Map([
      ['@sentry/browser', { name: '@sentry/browser', dependencies: { '@sentry/replay': '1.0.0', 'web-vitals': '^6' } }],
      ['@sentry/replay', { name: '@sentry/replay', peerDependencies: { 'left-pad': '^1' } }],
    ]);

    expect(findDisallowedDependencies(packages, ['@sentry/browser'], ['web-vitals'])).toEqual([
      '@sentry/browser -> @sentry/replay -> left-pad (peerDependencies)',
    ]);
  });
});
