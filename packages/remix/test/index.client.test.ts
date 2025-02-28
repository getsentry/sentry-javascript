import * as SentryReact from '@sentry/react';
import { describe, vi, it, expect, afterEach, type Mock } from 'vitest';

import { init } from '../src/index.client';

vi.mock('@sentry/react', {spy: true});

const reactInit = SentryReact.init as Mock;

describe('Client init()', () => {
  afterEach(() => {
    vi.clearAllMocks();

    SentryReact.getGlobalScope().clear();
    SentryReact.getIsolationScope().clear();
    SentryReact.getCurrentScope().clear();
    SentryReact.getCurrentScope().setClient(undefined);
  });

  it('inits the React SDK', () => {
    expect(reactInit).toHaveBeenCalledTimes(0);
    init({});
    expect(reactInit).toHaveBeenCalledTimes(1);
    expect(reactInit).toHaveBeenCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.remix',
            version: expect.any(String),
            packages: [
              {
                name: 'npm:@sentry/remix',
                version: expect.any(String),
              },
              {
                name: 'npm:@sentry/react',
                version: expect.any(String),
              },
            ],
          },
        },
      }),
    );
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});
