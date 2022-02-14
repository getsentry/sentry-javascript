import { Hub } from '@sentry/hub';
import { EventProcessor, Integration, Span, SpanContext } from '@sentry/types';
import { fill, isThenable, loadModule, logger } from '@sentry/utils';

type Callback = (...args: unknown[]) => void;

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

export interface MongoCursor {
  // count,
  // explain,
  // hasNext,
  // next,
  // tryNext,
  // forEach,
  // close,

  toArray(): Promise<unknown[]>;
  toArray(callback: Callback): void;
}

interface MongoOptions {
  operations?: Operation[];
  describeOperations?: boolean | Operation[];
  useMongoose?: boolean;
}

function measurePromiseOrCb(
  orig: (...args: unknown[]) => void | Promise<unknown>,
  args: unknown[],
  span: Span | undefined,
  cb: Callback | undefined,
): unknown {
  if (cb) {
    return orig(...args.slice(0, -1), function (...cbArgs: unknown[]) {
      span?.finish();
      cb(...cbArgs);
    });
  }

  const maybePromise = orig(...args) as Promise<unknown>;

  if (isThenable(maybePromise)) {
    return maybePromise.then((res: unknown) => {
      span?.finish();
      return res;
    });
  } else {
    span?.finish();
    return maybePromise;
  }
}

function instrumentCursor(cursor: MongoCursor, parentSpan: Span | undefined): MongoCursor {
  fill(cursor, 'toArray', (orig: () => void | Promise<unknown>) => {
    return function (this: MongoCursor, ...args: unknown[]) {
      const lastArg = args[args.length - 1];

      const span = parentSpan?.startChild({
        op: 'db',
        description: 'Cursor.toArray',
      });

      return measurePromiseOrCb(
        orig.bind(this),
        args,
        span,
        typeof lastArg === 'function' ? (lastArg as Callback) : undefined,
      );
    };
  });

  return cursor;
}

const serializeArg = (arg: unknown): string => {
  if (typeof arg === 'function') {
    return arg.name || '<anonymous>';
  }

  if (typeof arg === 'string') {
    return arg;
  }

  return JSON.stringify(arg);
};

function getOperationCallbackFromArgsOrUndefined(operation: string, args: unknown[]): Callback | undefined {
  const lastArg = args[args.length - 1];

  // Check if the operation was passed a callback. (mapReduce requires a different check, as
  // its (non-callback) arguments can also be functions.)
  if (typeof lastArg !== 'function' || (operation === 'mapReduce' && args.length === 2)) {
    return undefined;
  }

  return lastArg as Callback;
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
    const moduleName = this._useMongoose ? 'mongoose' : 'mongodb';
    const pkg = loadModule<{ Collection: MongoCollection }>(moduleName);

    if (!pkg) {
      logger.error(`Mongo Integration was unable to require \`${moduleName}\` package.`);
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

    const getSpanContext: Mongo['_getSpanContextFromOperationArguments'] =
      this._getSpanContextFromOperationArguments.bind(this);

    fill(collection.prototype, operation, function (orig: () => void | Promise<unknown>) {
      return function (this: MongoCollection, ...args: unknown[]) {
        const scope = getCurrentHub().getScope();
        const parentSpan = scope?.getSpan();
        const spanContext = getSpanContext(this, operation, args);

        // `find` returns a cursor, wrap cursor methods
        if (operation === 'find') {
          const cursor = orig.call(this, ...args); // => FindCursor
          return instrumentCursor(cursor, parentSpan?.startChild(spanContext));
        }

        return measurePromiseOrCb(
          orig.bind(this),
          args,
          parentSpan?.startChild(spanContext),
          getOperationCallbackFromArgsOrUndefined(operation, args),
        );
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
      op: `db`,
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
      for (let i = 0; i < signature.length; i++) {
        data[signature[i]] = serializeArg(args[i]);
      }
    } catch (_oO) {
      // no-empty
    }

    return spanContext;
  }
}
