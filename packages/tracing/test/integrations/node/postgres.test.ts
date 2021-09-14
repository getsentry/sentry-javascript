/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/hub';

import { Postgres } from '../../../src/integrations/node/postgres';
import { Span } from '../../../src/span';

class PgClient {
  // https://node-postgres.com/api/client#clientquery
  public query(_text: unknown, values: unknown, callback?: () => void) {
    if (typeof callback === 'function') {
      callback();
      return;
    }

    if (typeof values === 'function') {
      values();
      return;
    }

    return Promise.resolve();
  }
}

// mock for 'pg' / 'pg-native' package
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return {
        Client: PgClient,
        native: {
          Client: PgClient,
        },
      };
    },
  };
});

describe('setupOnce', () => {
  ['pg', 'pg-native'].forEach(pgApi => {
    const Client: PgClient = new PgClient();
    let scope = new Scope();
    let parentSpan: Span;
    let childSpan: Span;

    beforeAll(() => {
      (pgApi === 'pg' ? new Postgres() : new Postgres({ usePgNative: true })).setupOnce(
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

    it(`should wrap ${pgApi}'s query method accepting callback as the last argument`, done => {
      Client.query('SELECT NOW()', {}, function() {
        expect(scope.getSpan).toBeCalled();
        expect(parentSpan.startChild).toBeCalledWith({
          description: 'SELECT NOW()',
          op: 'db',
        });
        expect(childSpan.finish).toBeCalled();
        done();
      }) as void;
    });

    it(`should wrap ${pgApi}'s query method accepting callback as the second argument`, done => {
      Client.query('SELECT NOW()', function() {
        expect(scope.getSpan).toBeCalled();
        expect(parentSpan.startChild).toBeCalledWith({
          description: 'SELECT NOW()',
          op: 'db',
        });
        expect(childSpan.finish).toBeCalled();
        done();
      }) as void;
    });

    it(`should wrap ${pgApi}'s query method accepting no callback as the last argument but returning promise`, async () => {
      await Client.query('SELECT NOW()', null);
      expect(scope.getSpan).toBeCalled();
      expect(parentSpan.startChild).toBeCalledWith({
        description: 'SELECT NOW()',
        op: 'db',
      });
      expect(childSpan.finish).toBeCalled();
    });
  });
});
