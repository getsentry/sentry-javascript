import { describe, expect, it } from 'vitest';
import { instrumentXHR } from '../../src/instrument/xhr';
import { WINDOW } from '../../src/types';

// @ts-expect-error - idk
WINDOW.XMLHttpRequest = undefined;

describe('instrumentXHR', () => {
  it('it does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentXHR).not.toThrow();
  });
});
