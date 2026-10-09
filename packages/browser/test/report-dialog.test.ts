/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

async function loadSdk() {
  vi.resetModules();
  const sdk = await import('../src');
  sdk.init({ dsn });
  return sdk;
}

function reportDialogScript(): HTMLScriptElement | null {
  return document.head.querySelector('script[src*="/api/embed/error-page/"]');
}

describe('showReportDialog with Trusted Types', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  afterEach(() => {
    delete (window as { trustedTypes?: unknown }).trustedTypes;
  });

  it('loads the dialog script through the sentry-sdk policy', async () => {
    const createScriptURL = vi.fn((input: string) => input);
    const createPolicy = vi.fn((_name: string, rules: { createScriptURL(input: string): string }) => ({
      createScriptURL: (input: string) => createScriptURL(rules.createScriptURL(input)),
    }));
    (window as { trustedTypes?: unknown }).trustedTypes = { createPolicy };

    const { showReportDialog } = await loadSdk();
    showReportDialog({ eventId: 'abc' });

    expect(createPolicy).toHaveBeenCalledWith('sentry-sdk', expect.anything());
    expect(createScriptURL).toHaveBeenCalledWith(expect.stringContaining('/api/embed/error-page/'));
    expect(reportDialogScript()).not.toBeNull();
  });

  it('loads the dialog script without Trusted Types', async () => {
    const { showReportDialog } = await loadSdk();
    showReportDialog({ eventId: 'abc' });

    expect(reportDialogScript()?.src).toContain('https://sentry.io/api/embed/error-page/');
  });
});
