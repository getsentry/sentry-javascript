import { getCurrentHub } from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { GLOBAL_OBJ } from '@sentry/utils';

import { init } from '../src/index.client';

const reactInit = jest.spyOn(SentryReact, 'init');

describe('Client init()', () => {
  afterEach(() => {
    jest.clearAllMocks();
    GLOBAL_OBJ.__SENTRY__.hub = undefined;
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

  it('sets runtime on scope', () => {
    const currentScope = getCurrentHub().getScope();

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({});

    init({});

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({ runtime: 'browser' });
  });
});
