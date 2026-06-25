import type { InstrumentationBase } from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleFile } from '../../../InstrumentationNodeModuleFile';
import type { SpanAttributes } from '@sentry/core';
import {
  captureException,
  flush,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import type { FirebaseInstrumentation } from '../firebaseInstrumentation';
import type { AvailableFirebaseFunctions, FirebaseFunctions, OverloadedParameters } from '../types';

/**
 * Patches Firebase Functions v2 to add OpenTelemetry instrumentation
 * @param functionsSupportedVersions - supported versions of firebase-functions
 * @param wrap - reference to native instrumentation wrap function
 * @param unwrap - reference to native instrumentation unwrap function
 */
export function patchFunctions(
  functionsSupportedVersions: string[],
  wrap: InstrumentationBase['_wrap'],
  unwrap: InstrumentationBase['_unwrap'],
): InstrumentationNodeModuleDefinition {
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
        moduleExports => wrapCommonFunctions(moduleExports, wrap, unwrap, triggerType),
        moduleExports => unwrapCommonFunctions(moduleExports, unwrap),
      ),
    );
  });

  return moduleFunctionsCJS;
}

/**
 * Patches Cloud Functions for Firebase (v2) to add OpenTelemetry instrumentation
 *
 * @param triggerType - Type of trigger
 * @returns A function that patches the function
 */
export function patchV2Functions<T extends FirebaseFunctions = FirebaseFunctions>(
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

        const attributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.firebase.otel.functions',
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

        // Use an inactive span (not `startSpan`) so we can end the span before flushing on error.
        const span = startInactiveSpan({
          name: `firebase.function.${triggerType}`,
          op: 'http.request',
          kind: SPAN_KIND.SERVER,
          attributes,
        });

        return withActiveSpan(span, async () => {
          try {
            const result = await handler.apply(this, handlerArgs);
            span.end();
            return result;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR });
            captureException(error, {
              mechanism: {
                type: 'auto.firebase.otel.functions',
                handled: false,
              },
            });
            span.end();
            await flush(2000);
            throw error;
          }
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
  wrap: InstrumentationBase['_wrap'],
  unwrap: InstrumentationBase['_unwrap'],
  triggerType: 'function' | 'firestore' | 'scheduler' | 'storage',
): AvailableFirebaseFunctions {
  unwrapCommonFunctions(moduleExports, unwrap);

  switch (triggerType) {
    case 'function':
      wrap(moduleExports, 'onRequest', patchV2Functions('http.request'));
      wrap(moduleExports, 'onCall', patchV2Functions('http.call'));
      break;

    case 'firestore':
      wrap(moduleExports, 'onDocumentCreated', patchV2Functions('firestore.document.created'));
      wrap(moduleExports, 'onDocumentUpdated', patchV2Functions('firestore.document.updated'));
      wrap(moduleExports, 'onDocumentDeleted', patchV2Functions('firestore.document.deleted'));
      wrap(moduleExports, 'onDocumentWritten', patchV2Functions('firestore.document.written'));
      wrap(moduleExports, 'onDocumentCreatedWithAuthContext', patchV2Functions('firestore.document.created'));
      wrap(moduleExports, 'onDocumentUpdatedWithAuthContext', patchV2Functions('firestore.document.updated'));
      wrap(moduleExports, 'onDocumentDeletedWithAuthContext', patchV2Functions('firestore.document.deleted'));
      wrap(moduleExports, 'onDocumentWrittenWithAuthContext', patchV2Functions('firestore.document.written'));
      break;

    case 'scheduler':
      wrap(moduleExports, 'onSchedule', patchV2Functions('scheduler.scheduled'));
      break;

    case 'storage':
      wrap(moduleExports, 'onObjectFinalized', patchV2Functions('storage.object.finalized'));
      wrap(moduleExports, 'onObjectArchived', patchV2Functions('storage.object.archived'));
      wrap(moduleExports, 'onObjectDeleted', patchV2Functions('storage.object.deleted'));
      wrap(moduleExports, 'onObjectMetadataUpdated', patchV2Functions('storage.object.metadataUpdated'));
      break;
  }

  return moduleExports;
}

function unwrapCommonFunctions(
  moduleExports: AvailableFirebaseFunctions,
  unwrap: InstrumentationBase['_unwrap'],
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
