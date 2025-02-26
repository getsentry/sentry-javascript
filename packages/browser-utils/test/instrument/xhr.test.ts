import { instrumentXHR } from '../../src/instrument/xhr';
import { WINDOW } from '../../src/types';
import { describe, expect, it } from 'vitest';

// @ts-expect-error - idk
WINDOW.XMLHttpRequest = undefined;

describe('instrumentXHR', () => {
  it('it does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentXHR).not.toThrow();
  });
});
