/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/hub';

import { Mongo } from '../../../src/integrations/node/mongo';
import { Span } from '../../../src/span';

type MapReduceArg = () => void | string;
type Callback<T = any> = (error?: any, result?: T) => void;

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

  mapReduce(map: MapReduceArg, reduce: MapReduceArg): Promise<unknown>;
  mapReduce(map: MapReduceArg, reduce: MapReduceArg, callback: Callback<unknown>): void;
  mapReduce(map: MapReduceArg, reduce: MapReduceArg, options: Record<string, any>, callback?: Callback<unknown>): void;

  mapReduce(...args: any[]): Promise<unknown> | void {
    const lastArg = args[args.length - 1];

    // (map, reduce) => promise
    // (map, reduce, options) => promise
    if (args.length === 2 || (args.length === 3 && typeof lastArg !== 'function')) {
      return Promise.resolve();
    }

    // (map, reduce, cb) => void
    // (map, reduce, options, cb) => void
    if (typeof lastArg === 'function') {
      lastArg();
      return;
    }
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
      operations: ['insertOne', 'mapReduce', 'initializeOrderedBulkOp'],
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

  it('should call orig methods with origin context (this) and params', () => {
    const spy = jest.spyOn(collection, 'insertOne');

    const cb = function () {};
    const options = {};

    collection.insertOne(doc, options, cb) as void;
    expect(spy.mock.instances[0]).toBe(collection);
    expect(spy).toBeCalledWith(doc, options, cb);
  })

  it('should wrap method accepting callback as the last argument', done => {
    collection.insertOne(doc, {}, function () {
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

  describe('mapReduce operation', () => {
    describe('variable arguments', () => {
      const expectToBeMeasured = () => {
        expect(scope.getSpan).toBeCalled();
        expect(parentSpan.startChild).toBeCalledWith({
          data: {
            collectionName: 'mockedCollectionName',
            dbName: 'mockedDbName',
            namespace: 'mockedNamespace',
            map: '<anonymous>',
            reduce: '<anonymous>',
          },
          op: `db`,
          description: 'mapReduce',
        });
        expect(childSpan.finish).toBeCalled();
      }

      it('should work when (map, reduce, cb)', (done) => {
        collection.mapReduce(() => {}, () => {}, function()  {
          expectToBeMeasured()
          done();
        });
      });

      it('should work when (map, reduce, options, cb)', (done) => {
        collection.mapReduce(() => {}, () => {}, {},function()  {
          expectToBeMeasured()
          done();
        });
      });

      it('should work when (map, reduce) => Promise', async () => {
        await collection.mapReduce(() => {}, () => {});
        expectToBeMeasured();
      });

      it('should work when (map, reduce, options) => Promise', async () => {
        await collection.mapReduce(() => {}, () => {}, {});
        expectToBeMeasured();
      });
    })

    it('Should store function names', async () => {
      await collection.mapReduce(function TestMapFn() {}, function TestReduceFn() {});
      expect(scope.getSpan).toBeCalled();
      expect(parentSpan.startChild).toBeCalledWith({
        data: {
          collectionName: 'mockedCollectionName',
          dbName: 'mockedDbName',
          namespace: 'mockedNamespace',
          map: 'TestMapFn',
          reduce: 'TestReduceFn',
        },
        op: `db`,
        description: 'mapReduce',
      });
      expect(childSpan.finish).toBeCalled();
    })
  })
});
