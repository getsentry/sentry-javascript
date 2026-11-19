import * as fs from 'fs';
import * as path from 'path';
import { build, createBuilder } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sentryVitePlugin } from '../../src/vite';
import { createModuleVersionsProject, INJECTED_MODULES, runAndReadModules } from '../utils/module-versions-project';

describe('module versions injection (vite)', () => {
  let root: string;

  beforeEach(() => {
    root = createModuleVersionsProject();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function plugins(): ReturnType<typeof sentryVitePlugin> {
    return sentryVitePlugin({ telemetry: false, silent: true, release: { create: false } });
  }

  function readJs(dir: string): string {
    return fs
      .readdirSync(dir)
      .filter(file => file.endsWith('.js') || file.endsWith('.mjs'))
      .map(file => fs.readFileSync(path.join(dir, file), 'utf8'))
      .join('\n');
  }

  it('injects into SSR builds', async () => {
    const outDir = path.join(root, 'dist');
    await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: plugins(),
      build: { outDir, ssr: path.join(root, 'entry.js'), minify: false, rollupOptions: { output: { format: 'cjs' } } },
    });

    expect(runAndReadModules(readJs(outDir))).toEqual(INJECTED_MODULES);
  });

  it('does not inject into client builds', async () => {
    const outDir = path.join(root, 'dist');
    await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: plugins(),
      build: { outDir, lib: { entry: path.join(root, 'entry.js'), formats: ['es'] }, minify: false },
    });

    expect(readJs(outDir)).not.toContain('__SENTRY_SERVER_MODULES__');
  });

  it('injects only into environments with the server consumer', async () => {
    const clientOutDir = path.join(root, 'dist', 'client');
    const serverOutDir = path.join(root, 'dist', 'server');
    const builder = await createBuilder({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: plugins(),
      environments: {
        client: {
          build: { outDir: clientOutDir, rollupOptions: { input: path.join(root, 'entry.js') }, minify: false },
        },
        ssr: {
          build: {
            outDir: serverOutDir,
            ssr: path.join(root, 'entry.js'),
            minify: false,
            rollupOptions: { output: { format: 'cjs' } },
          },
        },
      },
    });
    await builder.buildApp();

    expect(readJs(path.join(clientOutDir, 'assets'))).not.toContain('__SENTRY_SERVER_MODULES__');
    expect(runAndReadModules(readJs(serverOutDir))).toEqual(INJECTED_MODULES);
  });
});
