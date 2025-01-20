import * as SentryNode from '@sentry/node';

import { init } from '../src/index.server';

jest.mock('@sentry/node', () => {
  return {
    __esModule: true,
    ...jest.requireActual('@sentry/node'),
  };
});

const nodeInit = jest.spyOn(SentryNode, 'init');

describe('Server init()', () => {
  afterEach(() => {
    jest.clearAllMocks();

    SentryNode.getGlobalScope().clear();
    SentryNode.getIsolationScope().clear();
    SentryNode.getCurrentScope().clear();
    SentryNode.getCurrentScope().setClient(undefined);
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

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});
