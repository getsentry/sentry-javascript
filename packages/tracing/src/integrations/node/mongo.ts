import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration, SpanContext } from '@sentry/types';
import { fill, isThenable, loadModule, logger } from '@sentry/utils';

import { shouldDisableAutoInstrumentation } from './utils/node-utils';

// This allows us to use the same array for both defaults options and the type itself.
// (note `as const` at the end to make it a union of string literal types (i.e. "a" | "b" | ... )
// and not just a string[])
type Operation = typeof OPERATIONS[number];
const OPERATIONS = [
  'aggregate', // aggregate(pipeline, options, callback)
  'bulkWrite', // bulkWrite(operations, options, callback)
  'countDocuments', // countDocuments(query, options, callback)
  'createIndex', // createIndex(fieldOrSpec, options, callback)
  'createIndexes', // createIndexes(indexSpecs, options, callback)
  'deleteMany', // deleteMany(filter, options, callback)
  'deleteOne', // deleteOne(filter, options, callback)
  'distinct', // distinct(key, query, options, callback)
  'drop', // drop(options, callback)
  'dropIndex', // dropIndex(indexName, options, callback)
  'dropIndexes', // dropIndexes(options, callback)
  'estimatedDocumentCount', // estimatedDocumentCount(options, callback)
  'find', // find(query, options, callback)
  'findOne', // findOne(query, options, callback)
  'findOneAndDelete', // findOneAndDelete(filter, options, callback)
  'findOneAndReplace', // findOneAndReplace(filter, replacement, options, callback)
  'findOneAndUpdate', // findOneAndUpdate(filter, update, options, callback)
  'indexes', // indexes(options, callback)
  'indexExists', // indexExists(indexes, options, callback)
  'indexInformation', // indexInformation(options, callback)
  'initializeOrderedBulkOp', // initializeOrderedBulkOp(options, callback)
  'insertMany', // insertMany(docs, options, callback)
  'insertOne', // insertOne(doc, options, callback)
  'isCapped', // isCapped(options, callback)
  'mapReduce', // mapReduce(map, reduce, options, callback)
  'options', // options(options, callback)
  'parallelCollectionScan', // parallelCollectionScan(options, callback)
  'rename', // rename(newName, options, callback)
  'replaceOne', // replaceOne(filter, doc, options, callback)
  'stats', // stats(options, callback)
  'updateMany', // updateMany(filter, update, options, callback)
  'updateOne', // updateOne(filter, update, options, callback)
] as const;

// All of the operations above take `options` and `callback` as their final parameters, but some of them
// take additional parameters as well. For those operations, this is a map of
// { <operation name>:  [<names of additional parameters>] }, as a way to know what to call the operation's
// positional arguments when we add them to the span's `data` object later
const OPERATION_SIGNATURES: {
  [op in Operation]?: string[];
} = {
  // aggregate intentionally not included because `pipeline` arguments are too complex to serialize well
  // see https://github.com/getsentry/sentry-javascript/pull/3102
  bulkWrite: ['operations'],
  countDocuments: ['query'],
  createIndex: ['fieldOrSpec'],
  createIndexes: ['indexSpecs'],
  deleteMany: ['filter'],
  deleteOne: ['filter'],
  distinct: ['key', 'query'],
  dropIndex: ['indexName'],
  find: ['query'],
  findOne: ['query'],
  findOneAndDelete: ['filter'],
  findOneAndReplace: ['filter', 'replacement'],
  findOneAndUpdate: ['filter', 'update'],
  indexExists: ['indexes'],
  insertMany: ['docs'],
  insertOne: ['doc'],
  mapReduce: ['map', 'reduce'],
  rename: ['newName'],
  replaceOne: ['filter', 'doc'],
  updateMany: ['filter', 'update'],
  updateOne: ['filter', 'update'],
};

interface MongoCollection {
  collectionName: string;
  dbName: string;
  namespace: string;
  prototype: {
    [operation in Operation]: (...args: unknown[]) => unknown;
  };
}

interface MongoOptions {
  operations?: Operation[];
  describeOperations?: boolean | Operation[];
  useMongoose?: boolean;
}

interface MongoCursor {
  once(event: 'close', listener: () => void): void;
}

function isCursor(maybeCursor: MongoCursor): maybeCursor is MongoCursor {
  return maybeCursor && typeof maybeCursor === 'object' && maybeCursor.once && typeof maybeCursor.once === 'function';
}

/** Tracing integration for mongo package */
export class Mongo implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Mongo';

  /**
   * @inheritDoc
   */
  public name: string = Mongo.id;

  private _operations: Operation[];
  private _describeOperations?: boolean | Operation[];
  private _useMongoose: boolean;

  /**
   * @inheritDoc
   */
  public constructor(options: MongoOptions = {}) {
    this._operations = Array.isArray(options.operations) ? options.operations : (OPERATIONS as unknown as Operation[]);
    this._describeOperations = 'describeOperations' in options ? options.describeOperations : true;
    this._useMongoose = !!options.useMongoose;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (shouldDisableAutoInstrumentation(getCurrentHub)) {
      __DEBUG_BUILD__ && logger.log('Mongo Integration is skipped because of instrumenter configuration.');
      return;
    }

    const moduleName = this._useMongoose ? 'mongoose' : 'mongodb';
    const pkg = loadModule<{ Collection: MongoCollection }>(moduleName);

    if (!pkg) {
      __DEBUG_BUILD__ && logger.error(`Mongo Integration was unable to require \`${moduleName}\` package.`);
      return;
    }

    this._instrumentOperations(pkg.Collection, this._operations, getCurrentHub);
  }

  /**
   * Patches original collection methods
   */
  private _instrumentOperations(collection: MongoCollection, operations: Operation[], getCurrentHub: () => Hub): void {
    operations.forEach((operation: Operation) => this._patchOperation(collection, operation, getCurrentHub));
  }

  /**
   * Patches original collection to utilize our tracing functionality
   */
  private _patchOperation(collection: MongoCollection, operation: Operation, getCurrentHub: () => Hub): void {
    if (!(operation in collection.prototype)) return;

    const getSpanContext = this._getSpanContextFromOperationArguments.bind(this);

    fill(collection.prototype, operation, function (orig: () => void | Promise<unknown>) {
      return function (this: unknown, ...args: unknown[]) {
        const lastArg = args[args.length - 1];
        const scope = getCurrentHub().getScope();
        const parentSpan = scope?.getSpan();

        // Check if the operation was passed a callback. (mapReduce requires a different check, as
        // its (non-callback) arguments can also be functions.)
        if (typeof lastArg !== 'function' || (operation === 'mapReduce' && args.length === 2)) {
          const span = parentSpan?.startChild(getSpanContext(this, operation, args));
          const maybePromiseOrCursor = orig.call(this, ...args);

          if (isThenable(maybePromiseOrCursor)) {
            return maybePromiseOrCursor.then((res: unknown) => {
              span?.finish();
              return res;
            });
          }
          // If the operation returns a Cursor
          // we need to attach a listener to it to finish the span when the cursor is closed.
          else if (isCursor(maybePromiseOrCursor)) {
            const cursor = maybePromiseOrCursor as MongoCursor;

            try {
              cursor.once('close', () => {
                span?.finish();
              });
            } catch (e) {
              // If the cursor is already closed, `once` will throw an error. In that case, we can
              // finish the span immediately.
              span?.finish();
            }

            return cursor;
          } else {
            span?.finish();
            return maybePromiseOrCursor;
          }
        }

        const span = parentSpan?.startChild(getSpanContext(this, operation, args.slice(0, -1)));

        return orig.call(this, ...args.slice(0, -1), function (err: Error, result: unknown) {
          span?.finish();
          lastArg(err, result);
        });
      };
    });
  }

  /**
   * Form a SpanContext based on the user input to a given operation.
   */
  private _getSpanContextFromOperationArguments(
    collection: MongoCollection,
    operation: Operation,
    args: unknown[],
  ): SpanContext {
    const data: { [key: string]: string } = {
      collectionName: collection.collectionName,
      dbName: collection.dbName,
      namespace: collection.namespace,
    };
    const spanContext: SpanContext = {
      op: 'db',
      description: operation,
      data,
    };

    // If the operation takes no arguments besides `options` and `callback`, or if argument
    // collection is disabled for this operation, just return early.
    const signature = OPERATION_SIGNATURES[operation];
    const shouldDescribe = Array.isArray(this._describeOperations)
      ? this._describeOperations.includes(operation)
      : this._describeOperations;

    if (!signature || !shouldDescribe) {
      return spanContext;
    }

    try {
      // Special case for `mapReduce`, as the only one accepting functions as arguments.
      if (operation === 'mapReduce') {
        const [map, reduce] = args as { name?: string }[];
        data[signature[0]] = typeof map === 'string' ? map : map.name || '<anonymous>';
        data[signature[1]] = typeof reduce === 'string' ? reduce : reduce.name || '<anonymous>';
      } else {
        for (let i = 0; i < signature.length; i++) {
          data[signature[i]] = JSON.stringify(args[i]);
        }
      }
    } catch (_oO) {
      // no-empty
    }

    return spanContext;
  }
}
