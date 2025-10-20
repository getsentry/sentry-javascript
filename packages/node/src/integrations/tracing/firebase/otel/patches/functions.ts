import type { Span, Tracer } from '@opentelemetry/api';
import { context, diag, SpanKind, trace } from '@opentelemetry/api';
import type { InstrumentationBase } from '@opentelemetry/instrumentation';
import {
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
  safeExecuteInTheMiddleAsync,
} from '@opentelemetry/instrumentation';
import type { SpanAttributes } from '@sentry/core';
import type {
  onDocumentCreated,
  onDocumentCreatedWithAuthContext,
  onDocumentDeleted,
  onDocumentDeletedWithAuthContext,
  onDocumentUpdated,
  onDocumentUpdatedWithAuthContext,
  onDocumentWritten,
  onDocumentWrittenWithAuthContext,
} from 'firebase-functions/firestore';
import type { onCall, onRequest } from 'firebase-functions/https';
import type { onSchedule } from 'firebase-functions/scheduler';
import type {
  onObjectArchived,
  onObjectDeleted,
  onObjectFinalized,
  onObjectMetadataUpdated,
} from 'firebase-functions/storage';
import type { FirebaseInstrumentation } from '../firebaseInstrumentation';
import type { FirebaseInstrumentationConfig, FunctionsSpanCreationHook } from '../types';

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
  const defaultFunctionsSpanCreationHook: FunctionsSpanCreationHook = () => {};

  let functionsSpanCreationHook: FunctionsSpanCreationHook = defaultFunctionsSpanCreationHook;
  const configFunctionsSpanCreationHook = config.functionsSpanCreationHook;

  if (typeof configFunctionsSpanCreationHook === 'function') {
    functionsSpanCreationHook = (span: Span) => {
      safeExecuteInTheMiddle(
        () => configFunctionsSpanCreationHook(span),
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
          wrapCommonFunctions(moduleExports, wrap, unwrap, tracer, functionsSpanCreationHook, triggerType),
        moduleExports => unwrapCommonFunctions(moduleExports, unwrap),
      ),
    );
  });

  return moduleFunctionsCJS;
}

type OverloadedParameters<T> = T extends {
  (...args: infer A1): unknown;
  (...args: infer A2): unknown;
  (...args: infer A3): unknown;
  (...args: infer A4): unknown;
}
  ? A1 | A2 | A3 | A4
  : T extends { (...args: infer A1): unknown; (...args: infer A2): unknown; (...args: infer A3): unknown }
    ? A1 | A2 | A3
    : T extends { (...args: infer A1): unknown; (...args: infer A2): unknown }
      ? A1 | A2
      : T extends (...args: infer A) => unknown
        ? A
        : unknown;

type AvailableFirebaseFunctions = {
  onRequest: typeof onRequest;
  onCall: typeof onCall;
  onDocumentCreated: typeof onDocumentCreated;
  onDocumentUpdated: typeof onDocumentUpdated;
  onDocumentDeleted: typeof onDocumentDeleted;
  onDocumentWritten: typeof onDocumentWritten;
  onDocumentCreatedWithAuthContext: typeof onDocumentCreatedWithAuthContext;
  onDocumentUpdatedWithAuthContext: typeof onDocumentUpdatedWithAuthContext;
  onDocumentDeletedWithAuthContext: typeof onDocumentDeletedWithAuthContext;
  onDocumentWrittenWithAuthContext: typeof onDocumentWrittenWithAuthContext;
  onSchedule: typeof onSchedule;
  onObjectFinalized: typeof onObjectFinalized;
  onObjectArchived: typeof onObjectArchived;
  onObjectDeleted: typeof onObjectDeleted;
  onObjectMetadataUpdated: typeof onObjectMetadataUpdated;
};

type FirebaseFunctions = AvailableFirebaseFunctions[keyof AvailableFirebaseFunctions];

/**
 * Patches Cloud Functions for Firebase (v2) to add OpenTelemetry instrumentation
 *
 * @param tracer - Opentelemetry Tracer
 * @param functionsSpanCreationHook - Function to create a span for the function
 * @param triggerType - Type of trigger
 * @returns A function that patches the function
 */
export function patchV2Functions<T extends FirebaseFunctions = FirebaseFunctions>(
  tracer: Tracer,
  functionsSpanCreationHook: FunctionsSpanCreationHook,
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
        functionsSpanCreationHook(span);

        return context.with(trace.setSpan(context.active(), span), () =>
          safeExecuteInTheMiddleAsync(
            () => handler.apply(this, handlerArgs),
            err => {
              if (err) {
                span.recordException(err);
              }

              span.end();
            },
          ),
        );
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
  functionsSpanCreationHook: FunctionsSpanCreationHook,
  triggerType: 'function' | 'firestore' | 'scheduler' | 'storage',
): AvailableFirebaseFunctions {
  unwrapCommonFunctions(moduleExports, unwrap);

  switch (triggerType) {
    case 'function':
      wrap(moduleExports, 'onRequest', patchV2Functions(tracer, functionsSpanCreationHook, 'http.request'));
      wrap(moduleExports, 'onCall', patchV2Functions(tracer, functionsSpanCreationHook, 'http.call'));
      break;

    case 'firestore':
      wrap(
        moduleExports,
        'onDocumentCreated',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.created'),
      );
      wrap(
        moduleExports,
        'onDocumentUpdated',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.updated'),
      );
      wrap(
        moduleExports,
        'onDocumentDeleted',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.deleted'),
      );
      wrap(
        moduleExports,
        'onDocumentWritten',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.written'),
      );
      wrap(
        moduleExports,
        'onDocumentCreatedWithAuthContext',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.created'),
      );
      wrap(
        moduleExports,
        'onDocumentUpdatedWithAuthContext',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.updated'),
      );

      wrap(
        moduleExports,
        'onDocumentDeletedWithAuthContext',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.deleted'),
      );

      wrap(
        moduleExports,
        'onDocumentWrittenWithAuthContext',
        patchV2Functions(tracer, functionsSpanCreationHook, 'firestore.document.written'),
      );
      break;

    case 'scheduler':
      wrap(moduleExports, 'onSchedule', patchV2Functions(tracer, functionsSpanCreationHook, 'scheduler.scheduled'));
      break;

    case 'storage':
      wrap(
        moduleExports,
        'onObjectFinalized',
        patchV2Functions(tracer, functionsSpanCreationHook, 'storage.object.finalized'),
      );
      wrap(
        moduleExports,
        'onObjectArchived',
        patchV2Functions(tracer, functionsSpanCreationHook, 'storage.object.archived'),
      );
      wrap(
        moduleExports,
        'onObjectDeleted',
        patchV2Functions(tracer, functionsSpanCreationHook, 'storage.object.deleted'),
      );
      wrap(
        moduleExports,
        'onObjectMetadataUpdated',
        patchV2Functions(tracer, functionsSpanCreationHook, 'storage.object.metadataUpdated'),
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
