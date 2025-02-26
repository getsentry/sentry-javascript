import { describe, expect, it } from 'vitest';
import sentryAstro from '../../src/index.server';

describe('server SDK', () => {
  it('exports the astro integration as a default export', () => {
    const integration = sentryAstro();
    expect(integration.name).toBe('@sentry/astro');
  });
});
