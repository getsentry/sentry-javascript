import { describe, expect, it } from 'vitest';
import { getDefaultExport } from '../../../src/utils/get-default-export';

describe('getDefaultExport', () => {
  it('returns the default export if there is one', () => {
    const mod = {
      default: () => {}
    };
    expect(getDefaultExport(mod)).toBe(mod.default)
  });
  it('returns the module export if no default', () => {
    const mod = {};
    expect(getDefaultExport(mod)).toBe(mod)
  });
  it('returns the module if a function and not plain object', () => {
    const mod = Object.assign(function () {}, {
      default: () => {}
    });
    expect(getDefaultExport(mod)).toBe(mod)
  });
  it('returns the module if a default is falsey', () => {
    const mod = Object.assign(function () {}, {
      default: false,
    });
    expect(getDefaultExport(mod)).toBe(mod)
  });
});
