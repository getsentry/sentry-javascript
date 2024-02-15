/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/unbound-method */
import { Hub, Scope, Span as SpanClass } from '@sentry/core';
import type { Span } from '@sentry/types';
import { logger } from '@sentry/utils';

import { Integrations } from '../../../src';
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
  let testClient = getTestClient({});

  beforeAll(() => {
    new Integrations.Mongo({
      operations: ['insertOne', 'initializeOrderedBulkOp'],
    }).setupOnce(
      () => undefined,
      () => new Hub(testClient, scope),
    );
  });

  beforeEach(() => {
    scope = new Scope();
    parentSpan = new SpanClass();
    childSpan = parentSpan.startChild();
    testClient = getTestClient({});
    jest.spyOn(scope, 'getSpan').mockReturnValueOnce(parentSpan);
    jest.spyOn(parentSpan, 'startChild').mockReturnValueOnce(childSpan);
    jest.spyOn(childSpan, 'end');
  });

  it('should wrap method accepting callback as the last argument', done => {
    collection.insertOne(doc, {}, function () {
      expect(scope.getSpan).toBeCalled();
      expect(parentSpan.startChild).toBeCalledWith({
        data: {
          'db.mongodb.collection': 'mockedCollectionName',
          'db.name': 'mockedDbName',
          'db.operation': 'insertOne',
          'db.system': 'mongodb',
        },
        op: 'db',
        origin: 'auto.db.mongo',
        description: 'insertOne',
      });
      expect(childSpan.end).toBeCalled();
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
        'db.system': 'mongodb',
      },
      op: 'db',
      origin: 'auto.db.mongo',
      description: 'insertOne',
    });
    expect(childSpan.end).toBeCalled();
  });

  it('attaches mongodb operation spans if sendDefaultPii is enabled', async () => {
    testClient.getOptions().sendDefaultPii = true;
    await collection.insertOne(doc, {});
    expect(scope.getSpan).toBeCalled();
    expect(parentSpan.startChild).toBeCalledWith({
      data: {
        'db.mongodb.collection': 'mockedCollectionName',
        'db.mongodb.doc': '{"name":"PickleRick","answer":42}',
        'db.name': 'mockedDbName',
        'db.operation': 'insertOne',
        'db.system': 'mongodb',
      },
      op: 'db',
      origin: 'auto.db.mongo',
      description: 'insertOne',
    });
    expect(childSpan.end).toBeCalled();
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
    expect(childSpan.end).toBeCalled();
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
