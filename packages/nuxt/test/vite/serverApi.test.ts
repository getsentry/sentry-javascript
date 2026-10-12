import { runWithNuxtContext } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveServerApi } from '../../src/vite/utils';

// The real kit, not a mock: on older hosts kit resolves `nitropack` from the project, so the
// fixture gives it a project with only `nitropack` installed. A temp dir has nothing hoisted above it.
let rootDir: string;

beforeAll(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nuxt-server-api-'));
  const nitropackDir = path.join(rootDir, 'node_modules', 'nitropack');
  fs.mkdirSync(nitropackDir, { recursive: true });
  fs.writeFileSync(
    path.join(nitropackDir, 'package.json'),
    JSON.stringify({ name: 'nitropack', version: '2.13.4', main: 'index.js' }),
  );
  fs.writeFileSync(path.join(nitropackDir, 'index.js'), '');
});

afterAll(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

function resolveForHost(version: string, options: Record<string, unknown>): ReturnType<typeof resolveServerApi> {
  const nuxt = {
    _version: version,
    options: { rootDir, modulesDir: [path.join(rootDir, 'node_modules')], ...options },
  } as unknown as Nuxt;

  return runWithNuxtContext(nuxt, resolveServerApi);
}

describe('resolveServerApi', () => {
  it.each([
    { host: 'Nuxt 3.7', version: '3.7.0', options: {} },
    {
      host: 'Nuxt 4.2 to 4.5',
      version: '4.5.2',
      options: { server: { builder: '@nuxt/nitro-server' } },
    },
  ])(
    'resolves `nitro2` from the installed `nitropack` on $host, which declares no Nitro major',
    ({ version, options }) => {
      expect(resolveForHost(version, options)).toBe('nitro2');
    },
  );

  it('resolves `nitro2` when the host declares Nitro v2 (Nuxt 4.6)', () => {
    expect(resolveForHost('4.6.0', { server: { builder: '@nuxt/nitro-server' }, _nitroMajor: 2 })).toBe('nitro2');
  });

  it('resolves `nitro3` when the host declares Nitro v3 (Nuxt 5)', () => {
    expect(resolveForHost('5.0.0', { server: { builder: '@nuxt/nitro-server' }, _nitroMajor: 3 })).toBe('nitro3');
  });

  it('resolves `nuxt` for the Vite server builder', () => {
    expect(resolveForHost('4.6.0', { server: { builder: '@nuxt/vite-server' }, _nitroMajor: 2 })).toBe('nuxt');
  });

  it('resolves `nuxt` for a custom builder object', () => {
    expect(resolveForHost('4.6.0', { server: { builder: { bundle() {} } }, _nitroMajor: 2 })).toBe('nuxt');
  });
});
