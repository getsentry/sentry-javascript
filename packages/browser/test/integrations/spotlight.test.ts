import type { Client, ClientOptions } from '@sentry/core';
import { shouldIgnoreSpan } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { SPOTLIGHT_IGNORE_SPANS, spotlightBrowserIntegration } from '../../src/integrations/spotlight';

function makeMockClient(initial: Partial<ClientOptions> = {}): Client {
  const options = { ...initial } as ClientOptions;
  return { getOptions: () => options } as Client;
}

function setupIntegrationAndGetIgnoreSpans(initial: Partial<ClientOptions> = {}) {
  const integration = spotlightBrowserIntegration();
  const client = makeMockClient(initial);
  integration.beforeSetup!(client);
  return client.getOptions().ignoreSpans!;
}

describe('spotlightBrowserIntegration', () => {
  it('appends spotlight interaction filters to ignoreSpans', () => {
    expect(setupIntegrationAndGetIgnoreSpans()).toEqual(SPOTLIGHT_IGNORE_SPANS);
  });

  it('preserves user-provided ignoreSpans entries', () => {
    expect(setupIntegrationAndGetIgnoreSpans({ ignoreSpans: [/keep-me/] })).toEqual([
      /keep-me/,
      ...SPOTLIGHT_IGNORE_SPANS,
    ]);
  });

  describe('drops spotlight interaction spans', () => {
    it.each([
      ['click on spotlight overlay', 'body > div#sentry-spotlight > div.overlay'],
      ['click on spotlight button', 'body > div > div#sentry-spotlight > button.close'],
      ['click on nested spotlight element', 'html > body > aside#sentry-spotlight'],
    ])('%s', (_label, name) => {
      const ignoreSpans = setupIntegrationAndGetIgnoreSpans();
      expect(shouldIgnoreSpan({ description: name, op: 'ui.interaction.click' }, ignoreSpans)).toBe(true);
    });
  });

  describe('keeps non-spotlight interaction spans', () => {
    it.each([
      ['regular click', 'body > div.main > button.submit', 'ui.interaction.click'],
      ['regular ui action', '/dashboard', 'ui.action.click'],
      ['non-interaction span', 'GET /api/data', 'http.client'],
    ])('%s', (_label, name, op) => {
      const ignoreSpans = setupIntegrationAndGetIgnoreSpans();
      expect(shouldIgnoreSpan({ description: name, op }, ignoreSpans)).toBe(false);
    });
  });
});
