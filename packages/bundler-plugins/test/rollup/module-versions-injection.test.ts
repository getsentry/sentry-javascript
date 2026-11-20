import * as fs from 'fs';
import * as path from 'path';
import { rollup } from 'rollup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sentryRollupPlugin } from '../../src/rollup';
import type { Options } from '../../src/core';
import { createModuleVersionsProject } from '../utils/module-versions-project';

describe('module versions injection (rollup)', () => {
  let root: string;

  beforeEach(() => {
    root = createModuleVersionsProject();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function buildApp(options: Options): Promise<string> {
    const bundle = await rollup({
      input: path.join(root, 'entry.js'),
      plugins: [sentryRollupPlugin({ telemetry: false, silent: true, release: { create: false }, ...options })],
    });
    const { output } = await bundle.generate({ format: 'esm' });
    return output.map(chunk => (chunk.type === 'chunk' ? chunk.code : '')).join('\n');
  }

  it('does not inject by default, because Rollup cannot tell where the output runs', async () => {
    expect(await buildApp({})).not.toContain('__SENTRY_SERVER_MODULES__');
  });

  it('injects with `injectModuleVersions: true`', async () => {
    // Rollup has no root option, so the versions come from the working directory, not from `root`.
    expect(await buildApp({ injectModuleVersions: true })).toContain('__SENTRY_SERVER_MODULES__');
  });

  it('injects one copy that entries sharing a chunk share', async () => {
    fs.writeFileSync(path.join(root, 'shared.js'), "export const shared = () => 'shared';\n");
    fs.writeFileSync(path.join(root, 'a.js'), "import { shared } from './shared.js';\nconsole.log('a', shared());\n");
    fs.writeFileSync(path.join(root, 'b.js'), "import { shared } from './shared.js';\nconsole.log('b', shared());\n");

    const bundle = await rollup({
      input: [path.join(root, 'a.js'), path.join(root, 'b.js')],
      plugins: [
        sentryRollupPlugin({ telemetry: false, silent: true, release: { create: false }, injectModuleVersions: true }),
      ],
    });
    const { output } = await bundle.generate({ format: 'esm' });
    const chunksWithModules = output.filter(
      chunk => chunk.type === 'chunk' && chunk.code.includes('__SENTRY_SERVER_MODULES__'),
    );

    expect(chunksWithModules.map(chunk => chunk.type === 'chunk' && !chunk.isEntry)).toEqual([true]);
  });
});
