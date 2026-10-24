import { describe, expect, it } from 'vitest';
import sentryAstroIntegration from '../../src/index.integration';
// oxlint-disable-next-line typescript/no-deprecated
import sentryAstro from '../../src/index.server';

describe('server SDK', () => {
  it('exports the astro integration as a default export', () => {
    expect(sentryAstro).toBe(sentryAstroIntegration);
  });
});
