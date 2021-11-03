/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/hub';

import { Mongo } from '../../../src/integrations/node/mongo';
import { Span } from '../../../src/span';

class Collection {
  public collectionName: string = 'mockedCollectionName';
  public dbName: string = 'mockedDbName';
  public namespace: string = 'mockedNamespace';

  // Method that can have a callback as last argument, or return a promise otherwise.
  public insertOne(_doc: unknown, _options: unknown, callback?: () => void) {
    if (typeof callback === 'function') {
      callback();
      return;
    }
    return Promise.resolve();
  }
  // Method that has no callback as last argument, and doesnt return promise.
  public initializeOrderedBulkOp() {
    return {};
  }
}

jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return {
        Collection,
      };
    },
  };
});

describe('patchOperation()', () => {
  const doc = {
    name: 'PickleRick',
    answer: 42,
  };
  const collection: Collection = new Collection();
  let scope = new Scope();
  let parentSpan: Span;
  let childSpan: Span;

  beforeAll(() => {
    new Mongo({
      operations: ['insertOne', 'initializeOrderedBulkOp'],
    }).setupOnce(
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

  it('should wrap method accepting callback as the last argument', done => {
    collection.insertOne(doc, {}, function() {
      expect(scope.getSpan).toBeCalled();
      expect(parentSpan.startChild).toBeCalledWith({
        data: {
          collectionName: 'mockedCollectionName',
          dbName: 'mockedDbName',
          doc: JSON.stringify(doc),
          namespace: 'mockedNamespace',
        },
        op: `db`,
        description: 'insertOne',
      });
      expect(childSpan.finish).toBeCalled();
      done();
    }) as void;
  });

  it('should wrap method accepting no callback as the last argument but returning promise', async () => {
    await collection.insertOne(doc, {});
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      data: {
        collectionName: 'mockedCollectionName',
        dbName: 'mockedDbName',
        doc: JSON.stringify(doc),
        namespace: 'mockedNamespace',
      },
      op: `db`,
      description: 'insertOne',
    });
    expect(childSpan.finish).toBeCalled();
  });

  it('should wrap method accepting no callback as the last argument and not returning promise', () => {
    collection.initializeOrderedBulkOp();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      data: {
        collectionName: 'mockedCollectionName',
        dbName: 'mockedDbName',
        namespace: 'mockedNamespace',
      },
      op: `db`,
      description: 'initializeOrderedBulkOp',
    });
    expect(childSpan.finish).toBeCalled();
  });
});
