import { getMainCarrier } from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { init } from '../src/index.client';

vi.mock('@sentry/react', { spy: true });

const reactInit = SentryReact.init as Mock;

describe('Client init()', () => {
  afterEach(() => {
    vi.clearAllMocks();

    getMainCarrier().__SENTRY__ = undefined;
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
            settings: {
              infer_ip: 'auto',
            },
          },
        },
      }),
    );
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});
