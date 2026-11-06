import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function runScenario(file: string): string {
  const res = spawnSync('bun', ['run', join(__dirname, file)], { cwd: __dirname, encoding: 'utf8' });
  expect(res.status, `run failed:\nstderr:\n${res.stderr}\nstdout:\n${res.stdout}`).toBe(0);
  return `${res.stdout}${res.stderr}`;
}

describe('no channel injection (Bun)', () => {
  it('warns without `debug` when the app runs unbuilt with `bun run`', () => {
    const output = runScenario('scenario.ts');

    expect(output).toContain('No diagnostics-channel injection detected');
    expect(output).toContain('@sentry/bun/plugin');
  });

  it('does not warn when no channel integration is installed', () => {
    expect(runScenario('scenario-no-integrations.ts')).not.toContain('No diagnostics-channel injection detected');
  });
});
