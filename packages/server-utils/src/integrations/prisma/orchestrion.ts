import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Span } from '@sentry/core';
import {
  getActiveSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanIsIgnored,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import { DB_COLLECTION_NAME, DB_OPERATION_NAME, SENTRY_OP } from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import { prismaChannels, PRISMA_LAZY_TERMINALS } from '../../orchestrion/config/prisma';
import type { TracingChannelLifeCycleOptions } from '../../tracing-channel';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../tracing-channel';
import { shouldIgnoreSpan } from './tracing-helper';

// Same span name as Prisma v5–v7's own operation span, so the tree looks the same across majors.
const OPERATION_SPAN_NAME = 'prisma:client:operation';
const PRISMA_ORIGIN = 'auto.db.prisma';

// Terminals call each other (`delete` reads the row through `first`); only the outermost call is the operation.
const operationSpans = new WeakSet<Span>();

interface PrismaCollection {
  modelName?: unknown;
  tableName?: unknown;
}

interface PrismaTerminalChannelContext {
  arguments: unknown[];
  self?: PrismaCollection;
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

// Prisma's `AsyncIterableResult`: `await`, `.then()` and `.first()` all funnel through `toArray()`; only
// `for await` goes through the iterator.
interface LazyResult {
  toArray: () => Promise<unknown>;
  [Symbol.asyncIterator]: () => AsyncIterator<unknown>;
}

interface PrismaV8InstrumentationOptions {
  ignoreSpanTypes: (string | RegExp)[];
}

/**
 * Opens a `prisma:client:operation` span per ORM call, kept active while the terminal runs so the `pg`
 * query spans nest under it like the `db_query` spans did on v5–v7.
 */
export function instrumentPrismaV8(options: PrismaV8InstrumentationOptions): void {
  if (shouldIgnoreSpan(OPERATION_SPAN_NAME, options.ignoreSpanTypes)) {
    return;
  }

  for (const channelName of Object.values(prismaChannels)) {
    const method = channelName.slice(channelName.lastIndexOf(':') + 1);
    const isLazy = (PRISMA_LAZY_TERMINALS as readonly string[]).includes(method);

    bindTracingChannelToSpan<PrismaTerminalChannelContext>(
      diagnosticsChannel.tracingChannel<PrismaTerminalChannelContext>(channelName),
      data => startOperationSpan(method, data),
      {
        // A stray query outside a request must not become a segment of its own.
        requiresParentSpan: true,
        ...(isLazy ? { deferSpanEnd: deferSpanEndUntilConsumed } : {}),
      },
    );
  }
}

function startOperationSpan(method: string, data: PrismaTerminalChannelContext): Span | undefined {
  const parentSpan = getActiveSpan();
  if (parentSpan && operationSpans.has(parentSpan)) {
    return undefined;
  }

  const model = stringOrUndefined(data.self?.modelName);
  const table = stringOrUndefined(data.self?.tableName);

  const span = startInactiveSpan({
    name: OPERATION_SPAN_NAME,
    parentSpan,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: PRISMA_ORIGIN,
      [SENTRY_OP]: DB,
      [DB_OPERATION_NAME]: method,
      [DB_COLLECTION_NAME]: table ?? model,
      // Prisma v5–v7's own attributes, kept so existing queries keep matching across the major.
      method,
      model,
      name: model ? `${model}.${method}` : method,
    },
  });
  operationSpans.add(span);
  return span;
}

// A lazy terminal returns before anything is queried, so the span stays open until the result is consumed,
// with consumption re-routed through the span's context so the driver call lands under it. A result that is
// never consumed never ran a query; its span is simply never ended.
const deferSpanEndUntilConsumed: NonNullable<
  TracingChannelLifeCycleOptions<PrismaTerminalChannelContext>['deferSpanEnd']
> = ({ span, data, end }) => {
  const result = data.result;
  if (!isLazyResult(result)) {
    return false;
  }

  // A throw in a channel subscriber is an uncaught exception; an unpatchable (frozen) result ends the span now.
  return safeChannelCallback(() => patchConsumption(result, span, end)) ?? false;
};

function patchConsumption(result: LazyResult, span: Span, end: (error?: unknown) => void): boolean {
  const toArray = result.toArray;
  const asyncIterator = result[Symbol.asyncIterator];

  // Built before either is installed, so a failed assignment can't leave a half-patched result.
  const patchedToArray = function (this: LazyResult): Promise<unknown> {
    const rows: Promise<unknown> = runUnderSpan(span, () => toArray.call(this));
    // Chained, not side-observed, so a rejected fire-and-forget `toArray()` still surfaces as unhandled.
    return rows.then(
      value => {
        end();
        return value;
      },
      (error: unknown) => {
        end(error);
        throw error;
      },
    );
  };
  const patchedAsyncIterator = function (this: LazyResult): AsyncIterableIterator<unknown> {
    return wrapIterator(
      runUnderSpan(span, () => asyncIterator.call(this)),
      span,
      end,
    );
  };

  result.toArray = patchedToArray;
  result[Symbol.asyncIterator] = patchedAsyncIterator;

  return true;
}

// An ignored child span is never emitted, so its children must keep parenting to the nearest emitted span
// (same rule as the tracing-channel binding and core `startSpan`).
function runUnderSpan<T>(span: Span, callback: () => T): T {
  if (spanIsIgnored(span) && getRootSpan(span) !== span) {
    return callback();
  }
  return withActiveSpan(span, callback);
}

function wrapIterator(
  iterator: AsyncIterator<unknown>,
  span: Span,
  end: (error?: unknown) => void,
): AsyncIterableIterator<unknown> {
  const settle = (step: Promise<IteratorResult<unknown>>): Promise<IteratorResult<unknown>> =>
    step.then(
      result => {
        if (result.done) {
          end();
        }
        return result;
      },
      error => {
        end(error);
        throw error;
      },
    );

  return {
    next: (...args) => settle(runUnderSpan(span, () => iterator.next(...args))),
    return: value => {
      const iteratorReturn = iterator.return?.bind(iterator);
      if (!iteratorReturn) {
        end();
        return Promise.resolve({ done: true, value });
      }
      return settle(runUnderSpan(span, () => iteratorReturn(value)));
    },
    throw: error => {
      const iteratorThrow = iterator.throw?.bind(iterator);
      if (!iteratorThrow) {
        end(error);
        return Promise.reject(error);
      }
      return settle(runUnderSpan(span, () => iteratorThrow(error)));
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isLazyResult(value: unknown): value is LazyResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LazyResult).toArray === 'function' &&
    typeof (value as LazyResult)[Symbol.asyncIterator] === 'function'
  );
}
