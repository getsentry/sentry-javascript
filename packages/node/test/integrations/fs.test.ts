import { describe, expect, it, vi } from 'vitest';

const { syncBuiltinESMExports } = vi.hoisted(() => ({ syncBuiltinESMExports: vi.fn() }));

// Deno before 2.8.2 has `syncBuiltinESMExports` only on the default export of `node:module`, so a named import of it fails to link.
vi.mock('module', () => ({ default: { syncBuiltinESMExports } }));
vi.mock('fs', () => ({ default: { promises: {}, realpath: {}, realpathSync: {} } }));

describe('enableFsInstrumentation', () => {
  it('syncs the builtin ESM exports when `module` has no named `syncBuiltinESMExports` export', async () => {
    const { enableFsInstrumentation } = await import('../../src/integrations/fs/vendored/instrumentation');

    enableFsInstrumentation();

    expect(syncBuiltinESMExports).toHaveBeenCalledTimes(1);
  });
});
