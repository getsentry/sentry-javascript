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
});
