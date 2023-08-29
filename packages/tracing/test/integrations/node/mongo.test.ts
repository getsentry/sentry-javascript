/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope } from '@sentry/core';
import { logger } from '@sentry/utils';

import { Integrations, Span } from '../../../src';
import { getTestClient } from '../../testutils';

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

// Jest mocks get hoisted. vars starting with `mock` are hoisted before imports.
/* eslint-disable no-var */
var mockCollection = Collection;

jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    loadModule() {
      return {
        Collection: mockCollection,
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
    new Integrations.Mongo({
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
    collection.insertOne(doc, {}, function () {
      expect(scope.getSpan).toBeCalled();
      expect(parentSpan.startChild).toBeCalledWith({
        data: {
          'db.mongodb.collection': 'mockedCollectionName',
          'db.name': 'mockedDbName',
          'db.operation': 'insertOne',
          'db.mongodb.doc': JSON.stringify(doc),
          'db.system': 'mongodb',
        },
        op: 'db',
        origin: 'auto.db.mongo',
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
        'db.mongodb.collection': 'mockedCollectionName',
        'db.name': 'mockedDbName',
        'db.operation': 'insertOne',
        'db.mongodb.doc': JSON.stringify(doc),
        'db.system': 'mongodb',
      },
      op: 'db',
      origin: 'auto.db.mongo',
      description: 'insertOne',
    });
    expect(childSpan.finish).toBeCalled();
  });

  it('should wrap method accepting no callback as the last argument and not returning promise', () => {
    collection.initializeOrderedBulkOp();
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      data: {
        'db.mongodb.collection': 'mockedCollectionName',
        'db.name': 'mockedDbName',
        'db.operation': 'initializeOrderedBulkOp',
        'db.system': 'mongodb',
      },
      op: 'db',
      origin: 'auto.db.mongo',
      description: 'initializeOrderedBulkOp',
    });
    expect(childSpan.finish).toBeCalled();
  });

  it("doesn't attach when using otel instrumenter", () => {
    const loggerLogSpy = jest.spyOn(logger, 'log');

    const client = getTestClient({ instrumenter: 'otel' });
    const hub = new Hub(client);

    const integration = new Integrations.Mongo();
    integration.setupOnce(
      () => {},
      () => hub,
    );

    expect(loggerLogSpy).toBeCalledWith('Mongo Integration is skipped because of instrumenter configuration.');
  });
});
