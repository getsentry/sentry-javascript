import * as SentryNode from '@sentry/node';
import { getCurrentHub } from '@sentry/node';
import { GLOBAL_OBJ } from '@sentry/utils';

import { Integrations, init } from '../src/index.server';

const nodeInit = jest.spyOn(SentryNode, 'init');

describe('Server init()', () => {
  afterEach(() => {
    jest.clearAllMocks();
    GLOBAL_OBJ.__SENTRY__.hub = undefined;
  });

  it('inits the Node SDK', () => {
    expect(nodeInit).toHaveBeenCalledTimes(0);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
    expect(nodeInit).toHaveBeenLastCalledWith(
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
                name: 'npm:@sentry/node',
                version: expect.any(String),
              },
            ],
          },
        },
      }),
    );
  });

  it("doesn't reinitialize the node SDK if already initialized", () => {
    expect(nodeInit).toHaveBeenCalledTimes(0);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
  });

  it('sets runtime on scope', () => {
    const currentScope = getCurrentHub().getScope();

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({});

    init({});

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({ runtime: 'node' });
  });

  it('has both node and tracing integrations', () => {
    expect(Integrations.Apollo).not.toBeUndefined();
    expect(Integrations.Http).not.toBeUndefined();
  });
});
