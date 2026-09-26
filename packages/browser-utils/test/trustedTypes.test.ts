/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const REPORT_DIALOG_URL = 'https://sentry.io/api/embed/error-page/?dsn=abc';

type Rules = { createScriptURL(input: string): string };

function fakeTrustedTypes() {
  return {
    createPolicy: vi.fn((_name: string, rules: Rules) => ({
      createScriptURL: (input: string) => rules.createScriptURL(input),
    })),
  };
}

function setTrustedTypes(value: unknown): void {
  (window as { trustedTypes?: unknown }).trustedTypes = value;
}

async function loadModule() {
  vi.resetModules();
  return import('../src/trustedTypes');
}

describe('getTrustedScriptURL', () => {
  afterEach(() => {
    delete (window as { trustedTypes?: unknown }).trustedTypes;
  });

  it('returns the url unchanged when Trusted Types is unavailable', async () => {
    const { getTrustedScriptURL } = await loadModule();

    expect(getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(REPORT_DIALOG_URL);
  });

  it('mints urls through the sentry-sdk policy', async () => {
    const trustedTypes = fakeTrustedTypes();
    setTrustedTypes(trustedTypes);

    const { getTrustedScriptURL } = await loadModule();

    expect(getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(REPORT_DIALOG_URL);
    expect(trustedTypes.createPolicy).toHaveBeenCalledWith('sentry-sdk', expect.anything());
  });

  it('creates the policy only once', async () => {
    const trustedTypes = fakeTrustedTypes();
    setTrustedTypes(trustedTypes);

    const { getTrustedScriptURL } = await loadModule();
    getTrustedScriptURL(REPORT_DIALOG_URL);
    getTrustedScriptURL(REPORT_DIALOG_URL);

    expect(trustedTypes.createPolicy).toHaveBeenCalledTimes(1);
  });

  it.each([
    'http://localhost:9000/api/embed/error-page/?dsn=abc',
    'https://self-hosted.example.com/sentry/api/embed/error-page/',
  ])('accepts the report dialog url %s', async url => {
    setTrustedTypes(fakeTrustedTypes());

    const { getTrustedScriptURL } = await loadModule();

    expect(getTrustedScriptURL(url)).toBe(url);
  });

  it.each([
    'https://example.com/evil.js',
    'https://sentry.io/api/embed/error-page/../../evil.js',
    'javascript:alert(1)',
    'data:text/javascript,alert(1)',
  ])('refuses %s', async url => {
    setTrustedTypes(fakeTrustedTypes());

    const { getTrustedScriptURL } = await loadModule();

    expect(() => getTrustedScriptURL(url)).toThrow(TypeError);
  });

  it('falls back to the raw url when the policy cannot be created', async () => {
    setTrustedTypes({
      createPolicy: vi.fn(() => {
        throw new Error('Policy "sentry-sdk" disallowed');
      }),
    });

    const { getTrustedScriptURL } = await loadModule();

    expect(getTrustedScriptURL(REPORT_DIALOG_URL)).toBe(REPORT_DIALOG_URL);
  });
});
