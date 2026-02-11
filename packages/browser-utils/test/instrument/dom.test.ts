import { describe, expect, it } from 'vitest';
import { instrumentDOM } from '../../src/instrument/dom';
import { WINDOW } from '../../src/types';

// @ts-expect-error - idk
WINDOW.XMLHttpRequest = undefined;

describe('instrumentXHR', () => {
  it('it does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentDOM).not.toThrow();
  });
});
