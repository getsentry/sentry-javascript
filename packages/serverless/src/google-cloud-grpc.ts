import type { EventEmitter } from 'events';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, getClient } from '@sentry/core';
import { startInactiveSpan } from '@sentry/node';
import type { Client, IntegrationFn } from '@sentry/types';
import { fill } from '@sentry/utils';

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

const SERVICE_PATH_REGEX = /^(\w+)\.googleapis.com$/;

const INTEGRATION_NAME = 'GoogleCloudGrpc';

const SETUP_CLIENTS = new WeakMap<Client, boolean>();

const _googleCloudGrpcIntegration = ((options: { optional?: boolean } = {}) => {
  const optional = options.optional || false;
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const gaxModule = require('google-gax');
        fill(
          gaxModule.GrpcClient.prototype, // eslint-disable-line @typescript-eslint/no-unsafe-member-access
          'createStub',
          wrapCreateStub,
        );
      } catch (e) {
        if (!optional) {
          throw e;
        }
      }
    },
    setup(client) {
      SETUP_CLIENTS.set(client, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Google Cloud Platform service requests tracking for GRPC APIs.
 */
export const googleCloudGrpcIntegration = defineIntegration(_googleCloudGrpcIntegration);

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
        if (typeof ret?.on !== 'function' || !SETUP_CLIENTS.has(getClient() as Client)) {
          return ret;
        }
        const span = startInactiveSpan({
          name: `${callType} ${methodName}`,
          onlyIfParent: true,
          op: `grpc.${serviceIdentifier}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.grpc.serverless',
          },
        });
        ret.on('status', () => {
          if (span) {
            span.end();
          }
        });
        return ret;
      },
  );
}

/** Identifies service by its address */
function identifyService(servicePath: string): string {
  const match = servicePath.match(SERVICE_PATH_REGEX);
  return match ? match[1] : servicePath;
}
