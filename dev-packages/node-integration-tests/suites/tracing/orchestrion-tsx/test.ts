import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test.each([
  { name: 'plain Node CommonJS', flags: [], scenario: 'scenario.cjs', operations: 2 },
  { name: 'tsx CommonJS', flags: ['--require', 'tsx/cjs'], scenario: 'scenario.cjs', operations: 2 },
  { name: 'plain Node ESM', flags: [], scenario: 'scenario.mjs', operations: 1 },
  // tsx can replace the hook's source, requiring another transform before compilation.
  {
    name: 'tsx ESM',
    flags: ['--import', 'tsx'],
    scenario: 'scenario.mjs',
    operations: 1,
    injections: expect.any(Number),
  },
  {
    name: 'plain Node ESM fragment',
    flags: [],
    scenario: 'scenario.mjs',
    operations: 1,
    suffix: '#instrumentation-test',
  },
  {
    name: 'tsx ESM fragment',
    flags: ['--import', 'tsx'],
    scenario: 'scenario.mjs',
    operations: 1,
    suffix: '#instrumentation-test',
    injections: expect.any(Number),
  },
  { name: 'plain Node after queried imports', flags: [], scenario: 'scenario-reload.mjs', operations: 1 },
  { name: 'tsx after queried imports', flags: ['--import', 'tsx'], scenario: 'scenario-reload.mjs', operations: 1 },
])('instruments each operation exactly once with $name', ({ flags, scenario, operations, suffix, injections }) => {
  const result = spawnSync(process.execPath, [...flags, join(__dirname, scenario), suffix ?? '?instrumentation-test'], {
    encoding: 'utf8',
    timeout: 30_000,
  });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(
    Array.from({ length: operations }, (_, index) => ({
      value: 'real-key',
      loads: index + 1,
      injections: injections ?? index + 1,
    })),
  );
});
