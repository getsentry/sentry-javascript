import { getCurrentHub } from '@sentry/node';
import type { Integration, Span, Transaction } from '@sentry/types';
import { fill } from '@sentry/utils';
import type { EventEmitter } from 'events';

interface GrpcFunction extends CallableFunction {
  (...args: unknown[]): EventEmitter;
}

interface GrpcFunctionObject extends GrpcFunction {
  requestStream: boolean;
  responseStream: boolean;
  originalName: string;
}

interface StubOptions {
  servicePath?: string;
}

interface CreateStubFunc extends CallableFunction {
  (createStub: unknown, options: StubOptions): PromiseLike<Stub>;
}

interface Stub {
  [key: string]: GrpcFunctionObject;
}

/** Google Cloud Platform service requests tracking for GRPC APIs */
export class GoogleCloudGrpc implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'GoogleCloudGrpc';

  /**
   * @inheritDoc
   */
  public name: string = GoogleCloudGrpc.id;

  private readonly _optional: boolean;

  public constructor(options: { optional?: boolean } = {}) {
    this._optional = options.optional || false;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const gaxModule = require('google-gax');
      fill(
        gaxModule.GrpcClient.prototype, // eslint-disable-line @typescript-eslint/no-unsafe-member-access
        'createStub',
        wrapCreateStub,
      );
    } catch (e) {
      if (!this._optional) {
        throw e;
      }
    }
  }
}

/** Returns a wrapped function that returns a stub with tracing enabled */
function wrapCreateStub(origCreate: CreateStubFunc): CreateStubFunc {
  return async function (this: unknown, ...args: Parameters<CreateStubFunc>) {
    const servicePath = args[1]?.servicePath;
    if (servicePath == null || servicePath == undefined) {
      return origCreate.apply(this, args);
    }
    const serviceIdentifier = identifyService(servicePath);
    const stub = await origCreate.apply(this, args);
    for (const methodName of Object.keys(Object.getPrototypeOf(stub))) {
      fillGrpcFunction(stub, serviceIdentifier, methodName);
    }
    return stub;
  };
}

/** Patches the function in grpc stub to enable tracing */
function fillGrpcFunction(stub: Stub, serviceIdentifier: string, methodName: string): void {
  const funcObj = stub[methodName];
  if (typeof funcObj !== 'function') {
    return;
  }
  const callType =
    !funcObj.requestStream && !funcObj.responseStream
      ? 'unary call'
      : funcObj.requestStream && !funcObj.responseStream
      ? 'client stream'
      : !funcObj.requestStream && funcObj.responseStream
      ? 'server stream'
      : 'bidi stream';
  if (callType != 'unary call') {
    return;
  }
  fill(
    stub,
    methodName,
    (orig: GrpcFunction): GrpcFunction =>
      (...args) => {
        const ret = orig.apply(stub, args);
        if (typeof ret?.on !== 'function') {
          return ret;
        }
        let transaction: Transaction | undefined;
        let span: Span | undefined;
        const scope = getCurrentHub().getScope();
        if (scope) {
          transaction = scope.getTransaction();
        }
        if (transaction) {
          span = transaction.startChild({
            description: `${callType} ${methodName}`,
            op: `grpc.${serviceIdentifier}`,
          });
        }
        ret.on('status', () => {
          if (span) {
            span.finish();
          }
        });
        return ret;
      },
  );
}

/** Identifies service by its address */
function identifyService(servicePath: string): string {
  const match = servicePath.match(/^(\w+)\.googleapis.com$/);
  return match ? match[1] : servicePath;
}
