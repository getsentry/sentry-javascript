import { instrumentDOM } from '../../src/instrument/dom';
import { WINDOW } from '../../src/types';
import { describe, expect, it } from 'vitest';

// @ts-expect-error - idk
WINDOW.XMLHttpRequest = undefined;

describe('instrumentXHR', () => {
  it('it does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentDOM).not.toThrow();
  });
});
