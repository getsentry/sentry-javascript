import * as fs from 'node:fs';
import * as path from 'node:path';
import * as semver from 'semver';
import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';

const packageRoot = path.resolve(__dirname, '..');

// `exports` mixes shapes (`"./package.json"` is a bare string), so it does not fit one index signature.
const exportsMap = packageJson.exports as unknown as Record<string, { import?: Record<string, string> }>;

/**
 * A mismatch between the `exports` map and the build output is invisible: the build and lint both
 * pass, and the package is broken only for whoever installs it. Rollup infers its output layout from
 * the module graph, so an unrelated change can relocate these files.
 */
describe('Remix 3 exports', () => {
  const subpaths = ['./v3', './v3/client', './v3/node'];

  it.each(subpaths)('%s is declared in the exports map', subpath => {
    expect(packageJson.exports).toHaveProperty([subpath]);
  });

  it.each(subpaths)('%s only exposes an import condition', subpath => {
    // Remix 3's asset server rejects CommonJS outright, so a `require` condition could never load.
    expect(Object.keys(exportsMap[subpath] ?? {})).toEqual(['import']);
  });

  it.each(subpaths)('%s points at files that exist in the build output', subpath => {
    const targets = Object.values(exportsMap[subpath]?.import ?? {});

    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      expect(fs.existsSync(path.join(packageRoot, target)), `${subpath} -> ${target} is missing`).toBe(true);
    }
  });

  describe('the Remix 3 peer range', () => {
    const range = packageJson.peerDependencies.remix;

    // Asserted by behaviour, so the range can change after Remix 3 reaches GA without failing here.
    it('accepts release candidates', () => {
      // `3.x` does not match `3.0.0-rc.1`: semver ranges exclude prereleases unless they name one.
      expect(semver.satisfies('3.0.0-rc.1', range)).toBe(true);
      expect(semver.satisfies('3.0.0-rc.2', range)).toBe(true);
    });

    it('accepts stable 3.x', () => {
      expect(semver.satisfies('3.0.0', range)).toBe(true);
      expect(semver.satisfies('3.4.2', range)).toBe(true);
    });

    it('rejects the next major', () => {
      expect(semver.satisfies('4.0.0', range)).toBe(false);
    });
  });

  it('marks every peer dependency optional', () => {
    // A Remix 3 app must not have the Remix 2 packages or React installed on its behalf.
    for (const name of Object.keys(packageJson.peerDependencies)) {
      expect(packageJson.peerDependenciesMeta, `${name} should be optional`).toHaveProperty([name, 'optional'], true);
    }
  });
});
