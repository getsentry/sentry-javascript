/**
 * @vitest-environment jsdom
 */
import * as SentryReact from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/client';

const reactInit = vi.spyOn(SentryReact, 'init');

describe('release from the page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SentryReact.getCurrentScope().setClient(undefined);
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('takes the release the server wrote into the page', () => {
    document.head.innerHTML = '<meta name="sentry-release" content="my-app@1.2.3+abc"/>';

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(reactInit).toHaveBeenLastCalledWith(expect.objectContaining({ release: 'my-app@1.2.3+abc' }));
  });

  it('keeps the release passed to `init`', () => {
    document.head.innerHTML = '<meta name="sentry-release" content="from-the-page"/>';

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', release: 'from-init' });

    expect(reactInit).toHaveBeenLastCalledWith(expect.objectContaining({ release: 'from-init' }));
  });

  it.each([
    { label: 'no meta tag', head: '' },
    { label: 'an empty meta tag', head: '<meta name="sentry-release" content=""/>' },
  ])('sets no release with $label', ({ head }) => {
    document.head.innerHTML = head;

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(reactInit).toHaveBeenLastCalledWith(expect.not.objectContaining({ release: expect.anything() }));
  });
});
