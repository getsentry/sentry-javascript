/*
 * Tests ported from @opentelemetry/instrumentation-mongoose@0.64.0
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-mongoose
 * Licensed under the Apache License, Version 2.0
 *
 * The upstream suite runs against a real mongoose + mongodb. Here we exercise the
 * same operation coverage against a fake mongoose module so the instrumentation
 * logic (span name, attributes, origin, error status, parent linking, patch/unpatch)
 * can be unit tested without a database.
 */

import type { SpanJSON } from '@sentry/core';
import { getClient, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Sentry from '../../../src';
import {
  _ALREADY_INSTRUMENTED,
  MongooseInstrumentation,
} from '../../../src/integrations/tracing/mongoose/vendored/mongoose';
import { cleanupOtel, mockSdkInit } from '../../helpers/mockSdkInit';

type AnyFn = (...args: any[]) => any;

const ORIGIN = 'auto.db.otel.mongoose';

const CONN = { name: 'test', host: 'localhost', port: 27017, user: 'admin' };
const COLLECTION = { name: 'users', conn: CONN };

// Names the instrumentation wraps on `Query.prototype` to capture the parent span.
const CONTEXT_CAPTURE_FUNCTIONS = [
  'deleteOne',
  'deleteMany',
  'find',
  'findOne',
  'estimatedDocumentCount',
  'countDocuments',
  'distinct',
  'where',
  '$where',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
];

// Returns an implementation that resolves/rejects as a promise, or invokes a trailing callback.
function fakeOp({ result = 'result', reject = false }: { result?: unknown; reject?: boolean } = {}): AnyFn {
  return function (this: unknown, ...args: unknown[]): unknown {
    const callback = args.find(arg => typeof arg === 'function') as AnyFn | undefined;
    const error = reject ? Object.assign(new Error('boom'), { code: 123 }) : null;

    if (callback) {
      callback(error, reject ? undefined : result);
      return undefined;
    }

    return reject ? Promise.reject(error) : Promise.resolve(result);
  };
}

interface FakeMongoose {
  Model: any;
  Query: any;
  Aggregate: any;
}

function createFakeMongoose({ reject = false }: { reject?: boolean } = {}): FakeMongoose {
  // NOTE: methods the instrumentation patches must live on the prototype (or the
  // constructor for statics), since `_wrap` operates on prototype/static members.
  class Query {
    public op: string;
    public mongooseCollection = COLLECTION;
    public model = { modelName: 'User' };

    public constructor(op: string) {
      this.op = op;
    }
  }

  (Query.prototype as any).exec = fakeOp({ reject });
  // chainable context-capture functions all return `this`
  CONTEXT_CAPTURE_FUNCTIONS.forEach(name => {
    (Query.prototype as any)[name] = function (this: unknown) {
      return this;
    };
  });

  class Aggregate {
    public _model = { collection: COLLECTION, modelName: 'User' };
    public _pipeline: unknown[] = [];
    public options = {};
  }

  (Aggregate.prototype as any).exec = fakeOp({ reject });

  class Model {
    public static collection = COLLECTION;
    public static modelName = 'User';

    public static aggregate(): Aggregate {
      return new Aggregate();
    }

    public static insertMany = fakeOp({ reject, result: [] });
    public static bulkWrite = fakeOp({ reject, result: {} });

    // Document instance methods (Mongoose 8.21.0+) return a Query.
    public updateOne(): Query {
      return new Query('updateOne');
    }
    public deleteOne(): Query {
      return new Query('deleteOne');
    }
  }

  (Model.prototype as any).save = fakeOp({ reject });
  // Removed in Mongoose 7+, only patched for v5/v6.
  (Model.prototype as any).remove = fakeOp({ reject });

  return { Model, Query, Aggregate };
}

describe('mongoose instrumentation', () => {
  let instrumentation: MongooseInstrumentation;
  let finishedSpans: SpanJSON[];

  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
    instrumentation = new MongooseInstrumentation();

    finishedSpans = [];
    getClient()?.on('spanEnd', span => {
      finishedSpans.push(spanToJSON(span));
    });
  });

  afterEach(() => {
    instrumentation.disable();
    cleanupOtel();
  });

  function patch(fake: FakeMongoose, moduleVersion?: string): FakeMongoose {
    const definition = instrumentation.getModuleDefinitions()[0]!;
    return definition.patch!(fake, moduleVersion) as FakeMongoose;
  }

  function unpatch(fake: FakeMongoose, moduleVersion?: string): void {
    const definition = instrumentation.getModuleDefinitions()[0]!;
    definition.unpatch!(fake, moduleVersion);
  }

  function mongooseSpans(): SpanJSON[] {
    return finishedSpans.filter(span => span.origin === ORIGIN);
  }

  function spanByDescription(description: string): SpanJSON | undefined {
    return mongooseSpans().find(span => span.description === description);
  }

  describe('Model methods', () => {
    it('creates a span for `save` with the expected name, attributes and origin', async () => {
      const { Model } = patch(createFakeMongoose());

      await Sentry.startSpan({ name: 'root' }, () => new Model().save());

      const span = spanByDescription('mongoose.User.save');
      expect(span).toBeDefined();
      expect(span!.origin).toBe(ORIGIN);
      expect(span!.data).toMatchObject({
        'db.operation': 'save',
        'db.system': 'mongoose',
        'db.mongodb.collection': 'users',
        'db.name': 'test',
        'db.user': 'admin',
        'net.peer.name': 'localhost',
        'net.peer.port': 27017,
      });
      // statement is never captured (no dbStatementSerializer)
      expect(span!.data['db.statement']).toBeUndefined();
      expect(span!.data['db.query.text']).toBeUndefined();
    });

    it('aliases `$save` to the patched `save`', () => {
      const { Model } = patch(createFakeMongoose());
      expect(Model.prototype.$save).toBe(Model.prototype.save);
    });

    it('supports the callback signature', async () => {
      const { Model } = patch(createFakeMongoose());

      const response = await new Promise((resolve, reject) => {
        Sentry.startSpan({ name: 'root' }, () => {
          new Model().save((err: Error | null, res?: unknown) => (err ? reject(err) : resolve(res)));
        });
      });

      expect(response).toBe('result');
      expect(spanByDescription('mongoose.User.save')).toBeDefined();
    });

    it('sets error status when the operation rejects', async () => {
      const { Model } = patch(createFakeMongoose({ reject: true }));

      await Sentry.startSpan({ name: 'root' }, () => new Model().save()).catch(() => undefined);

      const span = spanByDescription('mongoose.User.save');
      expect(span).toBeDefined();
      expect(span!.status).toContain('boom');
    });
  });

  describe('active span', () => {
    it('runs the underlying operation with the mongoose span active so nested work nests under it', async () => {
      const fake = createFakeMongoose();
      let activeDescription: string | undefined;
      // emulate the underlying driver reading the active span while the operation runs
      (fake.Model.prototype as any).save = function () {
        activeDescription = spanToJSON(Sentry.getActiveSpan()!).description;
        return Promise.resolve('ok');
      };
      patch(fake);

      await Sentry.startSpan({ name: 'root' }, () => new fake.Model().save());

      expect(activeDescription).toBe('mongoose.User.save');
    });
  });

  describe('Model statics', () => {
    it.each([
      ['insertMany', () => undefined],
      ['bulkWrite', () => undefined],
    ])('creates a span for `%s`', async opName => {
      const fake = patch(createFakeMongoose());

      await Sentry.startSpan({ name: 'root' }, () => fake.Model[opName]([{ name: 'a' }]));

      expect(spanByDescription(`mongoose.User.${opName}`)).toBeDefined();
    });

    it('creates a span for `aggregate` and links it to the build-time span', async () => {
      const fake = patch(createFakeMongoose());

      let rootSpanId: string | undefined;
      const aggregate = Sentry.startSpan({ name: 'root' }, root => {
        rootSpanId = root.spanContext().spanId;
        return fake.Model.aggregate();
      });

      await aggregate.exec();

      const span = spanByDescription('mongoose.User.aggregate');
      expect(span).toBeDefined();
      expect(span!.parent_span_id).toBe(rootSpanId);
    });
  });

  describe('Query exec', () => {
    it('creates a span named after the query op', async () => {
      const { Query } = patch(createFakeMongoose());

      await Sentry.startSpan({ name: 'root' }, () => new Query('findOne').exec());

      const span = spanByDescription('mongoose.User.findOne');
      expect(span).toBeDefined();
      expect(span!.data['db.operation']).toBe('findOne');
    });

    it('links exec to the span captured when the query was built', async () => {
      const { Query } = patch(createFakeMongoose());
      const query = new Query('findOne');

      let rootSpanId: string | undefined;
      Sentry.startSpan({ name: 'root' }, root => {
        rootSpanId = root.spanContext().spanId;
        // context-capture function stores the active span on the query
        query.find();
      });

      // exec runs outside the originating span but should still parent to it
      await query.exec();

      const span = spanByDescription('mongoose.User.findOne');
      expect(span).toBeDefined();
      expect(span!.parent_span_id).toBe(rootSpanId);
    });

    it('does not double-instrument a query already instrumented by a document method', async () => {
      const { Query } = patch(createFakeMongoose());
      const query = new Query('updateOne');
      (query as any)[_ALREADY_INSTRUMENTED] = true;

      await Sentry.startSpan({ name: 'root' }, () => query.exec());

      expect(spanByDescription('mongoose.User.updateOne')).toBeUndefined();
    });
  });

  describe('document update methods (Mongoose 8.21.0+)', () => {
    it('patches `updateOne`/`deleteOne` and tags the returned query', async () => {
      const { Model } = patch(createFakeMongoose(), '8.21.0');

      const query = await Sentry.startSpan({ name: 'root' }, () => new Model().updateOne());

      expect(spanByDescription('mongoose.User.updateOne')).toBeDefined();
      // returned Query is marked so its eventual exec() is not instrumented again
      expect((query as any)[_ALREADY_INSTRUMENTED]).toBe(true);
    });

    it('does not patch document methods for versions below 8.21.0', async () => {
      const { Model } = patch(createFakeMongoose(), '8.20.0');

      await Sentry.startSpan({ name: 'root' }, () => new Model().updateOne());

      expect(spanByDescription('mongoose.User.updateOne')).toBeUndefined();
    });
  });

  describe('remove (Mongoose 5/6)', () => {
    it('patches `remove` on v6', async () => {
      const { Model } = patch(createFakeMongoose(), '6.0.0');

      await Sentry.startSpan({ name: 'root' }, () => new Model().remove());

      expect(spanByDescription('mongoose.User.remove')).toBeDefined();
    });

    it('does not patch `remove` on v8', async () => {
      const { Model } = patch(createFakeMongoose(), '8.0.0');

      await Sentry.startSpan({ name: 'root' }, () => new Model().remove());

      expect(spanByDescription('mongoose.User.remove')).toBeUndefined();
    });
  });

  describe('unpatch', () => {
    it('stops creating spans after unpatch', async () => {
      const fake = patch(createFakeMongoose());
      unpatch(fake);

      await Sentry.startSpan({ name: 'root' }, () => new fake.Model().save());

      expect(mongooseSpans()).toHaveLength(0);
    });
  });
});
