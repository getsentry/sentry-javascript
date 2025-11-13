import { describe, expect, it } from 'vitest';
import { resolveSpotlightOptions } from '../../src/utils/resolveSpotlightOptions';

describe('resolveSpotlightOptions', () => {
  it('returns false when options.spotlight === false, regardless of env', () => {
    expect(resolveSpotlightOptions(false, undefined)).toBe(false);
    expect(resolveSpotlightOptions(false, true)).toBe(false);
    expect(resolveSpotlightOptions(false, false)).toBe(false);
    expect(resolveSpotlightOptions(false, 'http://localhost:8969')).toBe(false);
  });

  it('returns custom URL when options.spotlight is a string, regardless of env', () => {
    const customUrl = 'http://custom:1234/stream';
    expect(resolveSpotlightOptions(customUrl, undefined)).toBe(customUrl);
    expect(resolveSpotlightOptions(customUrl, true)).toBe(customUrl);
    expect(resolveSpotlightOptions(customUrl, false)).toBe(customUrl);
    expect(resolveSpotlightOptions(customUrl, 'http://other:5678')).toBe(customUrl);
  });

  it('returns env URL when options.spotlight === true and env is a URL', () => {
    const envUrl = 'http://localhost:8969/stream';
    expect(resolveSpotlightOptions(true, envUrl)).toBe(envUrl);
  });

  it('returns true when options.spotlight === true and env is true', () => {
    expect(resolveSpotlightOptions(true, true)).toBe(true);
  });

  it('returns true when options.spotlight === true and env is false', () => {
    expect(resolveSpotlightOptions(true, false)).toBe(true);
  });

  it('returns true when options.spotlight === true and env is undefined', () => {
    expect(resolveSpotlightOptions(true, undefined)).toBe(true);
  });

  it('returns env boolean when options.spotlight === undefined and env is boolean', () => {
    expect(resolveSpotlightOptions(undefined, true)).toBe(true);
    expect(resolveSpotlightOptions(undefined, false)).toBe(false);
  });

  it('returns env URL when options.spotlight === undefined and env is a URL', () => {
    const envUrl = 'http://localhost:8969/stream';
    expect(resolveSpotlightOptions(undefined, envUrl)).toBe(envUrl);
  });

  it('returns undefined when both options.spotlight and env are undefined', () => {
    expect(resolveSpotlightOptions(undefined, undefined)).toBe(undefined);
  });

  it('prioritizes env URL over env boolean when options.spotlight === undefined', () => {
    // This shouldn't happen in practice, but tests the logic path
    // In reality, envSpotlight will be either boolean, string, or undefined
    const envUrl = 'http://localhost:8969/stream';
    expect(resolveSpotlightOptions(undefined, envUrl)).toBe(envUrl);
  });
});
