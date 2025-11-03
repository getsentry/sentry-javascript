import type { Span, Tracer } from '@opentelemetry/api';
import { context, diag, SpanKind, trace } from '@opentelemetry/api';
import type { InstrumentationBase } from '@opentelemetry/instrumentation';
import {
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type { SpanAttributes } from '@sentry/core';
import type { FirebaseInstrumentation } from '../firebaseInstrumentation';
import type {
  AvailableFirebaseFunctions,
  FirebaseFunctions,
  FirebaseInstrumentationConfig,
  OverloadedParameters,
  RequestHook,
  ResponseHook,
} from '../types';

/**
 * Patches Firebase Functions v2 to add OpenTelemetry instrumentation
 * @param tracer - Opentelemetry Tracer
 * @param functionsSupportedVersions - supported versions of firebase-functions
 * @param wrap - reference to native instrumentation wrap function
 * @param unwrap - reference to native instrumentation unwrap function
 * @param config - Firebase instrumentation config
 */
export function patchFunctions(
  tracer: Tracer,
  functionsSupportedVersions: string[],
  wrap: InstrumentationBase['_wrap'],
  unwrap: InstrumentationBase['_unwrap'],
  config: FirebaseInstrumentationConfig,
): InstrumentationNodeModuleDefinition {
  let requestHook: RequestHook = () => {};
  let responseHook: ResponseHook = () => {};
  const errorHook = config.functions?.errorHook;
  const configRequestHook = config.functions?.requestHook;
  const configResponseHook = config.functions?.responseHook;

  if (typeof configResponseHook === 'function') {
    responseHook = (span: Span, err: unknown) => {
      safeExecuteInTheMiddle(
        () => configResponseHook(span, err),
        error => {
          if (!error) {
            return;
          }
          diag.error(error?.message);
        },
        true,
      );
    };
  }
  if (typeof configRequestHook === 'function') {
    requestHook = (span: Span) => {
      safeExecuteInTheMiddle(
        () => configRequestHook(span),
        error => {
          if (!error) {
            return;
          }
          diag.error(error?.message);
        },
        true,
      );
    };
  }

  const moduleFunctionsCJS = new InstrumentationNodeModuleDefinition('firebase-functions', functionsSupportedVersions);
  const modulesToInstrument = [
    { name: 'firebase-functions/lib/v2/providers/https.js', triggerType: 'function' },
    { name: 'firebase-functions/lib/v2/providers/firestore.js', triggerType: 'firestore' },
    { name: 'firebase-functions/lib/v2/providers/scheduler.js', triggerType: 'scheduler' },
    { name: 'firebase-functions/lib/v2/storage.js', triggerType: 'storage' },
  ] as const;

  modulesToInstrument.forEach(({ name, triggerType }) => {
    moduleFunctionsCJS.files.push(
      new InstrumentationNodeModuleFile(
        name,
        functionsSupportedVersions,
        moduleExports =>
          wrapCommonFunctions(
            moduleExports,
            wrap,
            unwrap,
            tracer,
            { requestHook, responseHook, errorHook },
            triggerType,
          ),
        moduleExports => unwrapCommonFunctions(moduleExports, unwrap),
      ),
    );
  });

  return moduleFunctionsCJS;
}

/**
 * Patches Cloud Functions for Firebase (v2) to add OpenTelemetry instrumentation
 *
 * @param tracer - Opentelemetry Tracer
 * @param functionsConfig - Firebase instrumentation config
 * @param triggerType - Type of trigger
 * @returns A function that patches the function
 */
export function patchV2Functions<T extends FirebaseFunctions = FirebaseFunctions>(
  tracer: Tracer,
  functionsConfig: FirebaseInstrumentationConfig['functions'],
  triggerType: string,
): (original: T) => (...args: OverloadedParameters<T>) => ReturnType<T> {
  return function v2FunctionsWrapper(original: T): (...args: OverloadedParameters<T>) => ReturnType<T> {
    return function (this: FirebaseInstrumentation, ...args: OverloadedParameters<T>): ReturnType<T> {
      const handler = typeof args[0] === 'function' ? args[0] : args[1];
      const documentOrOptions = typeof args[0] === 'function' ? undefined : args[0];

      if (!handler) {
        return original.call(this, ...args);
      }

      const wrappedHandler = async function (this: unknown, ...handlerArgs: unknown[]): Promise<unknown> {
        const functionName = process.env.FUNCTION_TARGET || process.env.K_SERVICE || 'unknown';
        const span = tracer.startSpan(`firebase.function.${triggerType}`, {
          kind: SpanKind.SERVER,
        });

        const attributes: SpanAttributes = {
          'faas.name': functionName,
          'faas.trigger': triggerType,
          'faas.provider': 'firebase',
        };

        if (process.env.GCLOUD_PROJECT) {
          attributes['cloud.project_id'] = process.env.GCLOUD_PROJECT;
        }

        if (process.env.EVENTARC_CLOUD_EVENT_SOURCE) {
          attributes['cloud.event_source'] = process.env.EVENTARC_CLOUD_EVENT_SOURCE;
        }

        span.setAttributes(attributes);
        functionsConfig?.requestHook?.(span);

        // Can be changed to safeExecuteInTheMiddleAsync once following is merged and released
        // https://github.com/open-telemetry/opentelemetry-js/pull/6032
        return context.with(trace.setSpan(context.active(), span), async () => {
          let error: Error | undefined;
          let result: T | undefined;

          try {
            result = await handler.apply(this, handlerArgs);
          } catch (e) {
            error = e as Error;
          }

          functionsConfig?.responseHook?.(span, error);

          if (error) {
            span.recordException(error);
          }

          span.end();

          if (error) {
            await functionsConfig?.errorHook?.(span, error);
            throw error;
          }

          return result;
        });
      };

      if (documentOrOptions) {
        return original.call(this, documentOrOptions, wrappedHandler);
      } else {
        return original.call(this, wrappedHandler);
      }
    };
  };
}

function wrapCommonFunctions(
  moduleExports: AvailableFirebaseFunctions,
  wrap: InstrumentationBase<FirebaseInstrumentationConfig>['_wrap'],
  unwrap: InstrumentationBase<FirebaseInstrumentationConfig>['_unwrap'],
  tracer: Tracer,
  functionsConfig: FirebaseInstrumentationConfig['functions'],
  triggerType: 'function' | 'firestore' | 'scheduler' | 'storage',
): AvailableFirebaseFunctions {
  unwrapCommonFunctions(moduleExports, unwrap);

  switch (triggerType) {
    case 'function':
      wrap(moduleExports, 'onRequest', patchV2Functions(tracer, functionsConfig, 'http.request'));
      wrap(moduleExports, 'onCall', patchV2Functions(tracer, functionsConfig, 'http.call'));
      break;

    case 'firestore':
      wrap(moduleExports, 'onDocumentCreated', patchV2Functions(tracer, functionsConfig, 'firestore.document.created'));
      wrap(moduleExports, 'onDocumentUpdated', patchV2Functions(tracer, functionsConfig, 'firestore.document.updated'));
      wrap(moduleExports, 'onDocumentDeleted', patchV2Functions(tracer, functionsConfig, 'firestore.document.deleted'));
      wrap(moduleExports, 'onDocumentWritten', patchV2Functions(tracer, functionsConfig, 'firestore.document.written'));
      wrap(
        moduleExports,
        'onDocumentCreatedWithAuthContext',
        patchV2Functions(tracer, functionsConfig, 'firestore.document.created'),
      );
      wrap(
        moduleExports,
        'onDocumentUpdatedWithAuthContext',
        patchV2Functions(tracer, functionsConfig, 'firestore.document.updated'),
      );

      wrap(
        moduleExports,
        'onDocumentDeletedWithAuthContext',
        patchV2Functions(tracer, functionsConfig, 'firestore.document.deleted'),
      );

      wrap(
        moduleExports,
        'onDocumentWrittenWithAuthContext',
        patchV2Functions(tracer, functionsConfig, 'firestore.document.written'),
      );
      break;

    case 'scheduler':
      wrap(moduleExports, 'onSchedule', patchV2Functions(tracer, functionsConfig, 'scheduler.scheduled'));
      break;

    case 'storage':
      wrap(moduleExports, 'onObjectFinalized', patchV2Functions(tracer, functionsConfig, 'storage.object.finalized'));
      wrap(moduleExports, 'onObjectArchived', patchV2Functions(tracer, functionsConfig, 'storage.object.archived'));
      wrap(moduleExports, 'onObjectDeleted', patchV2Functions(tracer, functionsConfig, 'storage.object.deleted'));
      wrap(
        moduleExports,
        'onObjectMetadataUpdated',
        patchV2Functions(tracer, functionsConfig, 'storage.object.metadataUpdated'),
      );
      break;
  }

  return moduleExports;
}

function unwrapCommonFunctions(
  moduleExports: AvailableFirebaseFunctions,
  unwrap: InstrumentationBase<FirebaseInstrumentationConfig>['_unwrap'],
): AvailableFirebaseFunctions {
  const methods: (keyof AvailableFirebaseFunctions)[] = [
    'onSchedule',
    'onRequest',
    'onCall',
    'onObjectFinalized',
    'onObjectArchived',
    'onObjectDeleted',
    'onObjectMetadataUpdated',
    'onDocumentCreated',
    'onDocumentUpdated',
    'onDocumentDeleted',
    'onDocumentWritten',
    'onDocumentCreatedWithAuthContext',
    'onDocumentUpdatedWithAuthContext',
    'onDocumentDeletedWithAuthContext',
    'onDocumentWrittenWithAuthContext',
  ];

  for (const method of methods) {
    if (isWrapped(moduleExports[method])) {
      unwrap(moduleExports, method);
    }
  }
  return moduleExports;
}
