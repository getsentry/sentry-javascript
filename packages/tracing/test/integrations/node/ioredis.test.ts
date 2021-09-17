/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/hub';

import { IORedis } from '../../../src/integrations/node/ioredis';
import { Span } from '../../../src/span';

class Redis {
  public sendCommand(_command: unknown, ..._args: unknown[]) {
    return Promise.resolve();
  }
}

jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return Redis;
    },
  };
});

describe('patchOperation', () => {
  const redis: Redis = new Redis();
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;

  beforeAll(() => {
    new IORedis().setupOnce(
      () => undefined,
      () => new Hub(undefined, scope),
    );
  });

  beforeEach(() => {
    scope = new Scope();
    parentSpan = new Span();
    childSpan = parentSpan.startChild();
    jest.spyOn(scope, 'getSpan').mockReturnValueOnce(parentSpan);
    jest.spyOn(parentSpan, 'startChild').mockReturnValueOnce(childSpan);
    jest.spyOn(childSpan, 'finish');
  });

  it('should wrap the sendCommand method and process a new span', done => {
    void redis
      .sendCommand({
        name: 'set',
        args: ['key', 'value'],
      })
      .then(() => {
        expect(scope.getSpan).toBeCalled();
        expect(parentSpan.startChild).toBeCalledWith({
          op: 'redis',
          description: 'set',
          data: {
            arguments: 'key,value',
          },
        });
        expect(childSpan.finish).toBeCalled();
        done();
      });
  });
});
