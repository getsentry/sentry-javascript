import type { Nitro } from 'nitro/types';
import { describe, expect, it } from 'vitest';
import { instrumentServer } from '../src/instruments/instrumentServer';

function createNitro(options: Partial<Nitro['options']> = {}): Nitro {
  return { options: { plugins: [], ...options } } as unknown as Nitro;
}

describe('instrumentServer', () => {
  it('makes Nitro bundle the runtime directory', () => {
    const nitro = createNitro();

    instrumentServer(nitro);

    expect(nitro.options.noExternals).toEqual([expect.stringMatching(/packages\/nitro\/src\/runtime\/$/)]);
  });

  it('makes Nitro bundle the runtime directory with `noExternals: false`', () => {
    const nitro = createNitro({ noExternals: false });

    instrumentServer(nitro);

    expect(nitro.options.noExternals).toEqual([expect.stringMatching(/src\/runtime\/$/)]);
  });

  it('keeps existing `noExternals` entries', () => {
    const nitro = createNitro({ noExternals: ['some-package'] });

    instrumentServer(nitro);

    expect(nitro.options.noExternals).toEqual(['some-package', expect.stringMatching(/src\/runtime\/$/)]);
  });

  it('leaves `noExternals: true` alone, since Nitro already bundles everything', () => {
    const nitro = createNitro({ noExternals: true });

    instrumentServer(nitro);

    expect(nitro.options.noExternals).toBe(true);
  });
});
