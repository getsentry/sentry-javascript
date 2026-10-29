import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('no channel injection (Bun)', () => {
  it('warns without `debug` when the app runs unbuilt with `bun run`', () => {
    const res = spawnSync('bun', ['run', join(__dirname, 'scenario.ts')], { cwd: __dirname, encoding: 'utf8' });

    expect(res.status, `run failed:\nstderr:\n${res.stderr}\nstdout:\n${res.stdout}`).toBe(0);
    expect(`${res.stdout}${res.stderr}`).toContain('No diagnostics-channel injection detected');
    expect(`${res.stdout}${res.stderr}`).toContain('@sentry/bun/plugin');
  });
});
