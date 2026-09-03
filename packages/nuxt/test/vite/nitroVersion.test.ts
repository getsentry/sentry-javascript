import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getNitroMajorVersion } from '../../src/vite/utils';

// Real filesystem fixtures instead of mocks: the bug this guards against lives in
// module resolution walking up the directory tree, which mocks cannot reproduce.
let monorepoRoot: string;

function writePackage(dir: string, packageJson: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ main: 'index.js', ...packageJson }));
  fs.writeFileSync(path.join(dir, 'index.js'), '');
}

function createApp(appName: string, packages: Record<string, Record<string, unknown>>): string {
  const appDir = path.join(monorepoRoot, 'apps', appName);
  fs.mkdirSync(appDir, { recursive: true });
  for (const [name, packageJson] of Object.entries(packages)) {
    writePackage(path.join(appDir, 'node_modules', name), packageJson);
  }
  return appDir;
}

beforeAll(() => {
  monorepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nitro-version-'));
  // An unrelated Nitro v3 above the apps, like a monorepo root devDependency
  writePackage(path.join(monorepoRoot, 'node_modules', 'nitro'), { name: 'nitro', version: '3.0.0-beta.1' });
});

afterAll(() => {
  fs.rmSync(monorepoRoot, { recursive: true, force: true });
});

describe('getNitroMajorVersion', () => {
  it('detects v2 when nuxt depends on nitropack directly (Nuxt 3 / <=4.1), ignoring a nitro v3 higher up the tree', async () => {
    const appDir = createApp('nuxt-4-old', {
      nuxt: { name: 'nuxt', version: '4.1.0', dependencies: { nitropack: '^2.12.0' } },
      nitropack: { name: 'nitropack', version: '2.12.0' },
    });

    await expect(getNitroMajorVersion(appDir)).resolves.toBe(2);
  });

  it('detects v2 through @nuxt/nitro-server when it depends on nitropack (Nuxt >=3.21 stable)', async () => {
    const appDir = createApp('nuxt-4-stable', {
      nuxt: { name: 'nuxt', version: '4.5.2', dependencies: { '@nuxt/nitro-server': '4.5.2' } },
      '@nuxt/nitro-server': { name: '@nuxt/nitro-server', version: '4.5.2', dependencies: { nitropack: '^2.13.4' } },
      nitropack: { name: 'nitropack', version: '2.13.4' },
    });

    await expect(getNitroMajorVersion(appDir)).resolves.toBe(2);
  });

  it('detects v3 through @nuxt/nitro-server when it depends on nitro (Nuxt 5)', async () => {
    const appDir = createApp('nuxt-5', {
      nuxt: { name: 'nuxt', version: '5.0.0', dependencies: { '@nuxt/nitro-server': 'npm:@nuxt/nitro-server-nightly' } },
      '@nuxt/nitro-server': {
        name: '@nuxt/nitro-server-nightly',
        version: '5.0.0-nightly',
        dependencies: { nitro: '^3.0.0-beta' },
      },
      nitro: { name: 'nitro', version: '3.0.0-beta.2' },
    });

    await expect(getNitroMajorVersion(appDir)).resolves.toBe(3);
  });

  it('detects v3 when nuxt depends on nitro directly, without @nuxt/nitro-server', async () => {
    const appDir = createApp('nuxt-direct-nitro', {
      nuxt: { name: 'nuxt', version: '5.1.0', dependencies: { nitro: '^3.1.0' } },
      nitro: { name: 'nitro', version: '3.1.0' },
    });

    await expect(getNitroMajorVersion(appDir)).resolves.toBe(3);
  });

  it('falls back to v3 when the declared nitro package has no readable version (stub package)', async () => {
    const appDir = createApp('nuxt-5-stub', {
      nuxt: { name: 'nuxt', version: '5.0.0', dependencies: { '@nuxt/nitro-server': 'npm:@nuxt/nitro-server-nightly' } },
      '@nuxt/nitro-server': {
        name: '@nuxt/nitro-server-nightly',
        version: '5.0.0-nightly',
        dependencies: { nitro: '^3.0.0-beta' },
      },
      nitro: { name: 'nitro' },
    });

    await expect(getNitroMajorVersion(appDir)).resolves.toBe(3);
  });

  it('defaults to v2 when nuxt cannot be resolved', async () => {
    const appDir = path.join(monorepoRoot, 'apps', 'no-nuxt');
    fs.mkdirSync(appDir, { recursive: true });

    await expect(getNitroMajorVersion(appDir)).resolves.toBe(2);
  });
});
