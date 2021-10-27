/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/hub';
import { Server } from 'socket.io';

import { SocketIO } from '../../../src/integrations/node/socket.io';
import { Span } from '../../../src/span';

jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return {
        Client: Server,
        native: {
          Client: Server,
        },
      };
    },
  };
});

describe('setupOnce', () => {
  const Client = new Server();
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;

  beforeAll(() => {
    new SocketIO().setupOnce(
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

  it(`should wrap emit's query method accepting callback as the last argument`, () => {
    Client.emit('test', { a: 1 });

    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      op: 'test send',
    });
    expect(childSpan.finish).toBeCalled();
  });
});
