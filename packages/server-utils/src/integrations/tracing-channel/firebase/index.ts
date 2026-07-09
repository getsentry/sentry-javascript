import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import { CHANNELS } from '../../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../../tracing-channel';
import type { FirestoreReference } from './firestore-types';
import { startFirestoreSpan } from './firestore';
import { wrapFunctionsRegistration } from './functions';

// NOTE: this uses the same name as the OTel integration by design. When enabled, the OTel 'Firebase'
// integration is omitted from the default set.
const INTEGRATION_NAME = 'Firebase' as const;

// The context orchestrion's transform attaches to each firestore channel: `arguments` is the live args
// of the wrapped `addDoc`/`getDocs`/`setDoc`/`deleteDoc` call, `arguments[0]` the reference.
interface FirestoreChannelContext {
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
  error?: unknown;
}

// The firestore operations, keyed by channel. `useParent` mirrors the OTel integration: `setDoc`/
// `deleteDoc` take a *document* reference but the span is named after its parent *collection*.
const FIRESTORE_OPERATIONS: Array<{ channel: string; spanName: string; useParent: boolean }> = [
  { channel: CHANNELS.FIREBASE_FIRESTORE_ADD_DOC, spanName: 'addDoc', useParent: false },
  { channel: CHANNELS.FIREBASE_FIRESTORE_GET_DOCS, spanName: 'getDocs', useParent: false },
  { channel: CHANNELS.FIREBASE_FIRESTORE_SET_DOC, spanName: 'setDoc', useParent: true },
  { channel: CHANNELS.FIREBASE_FIRESTORE_DELETE_DOC, spanName: 'deleteDoc', useParent: true },
];

// The firebase-functions triggers, keyed by channel. The value is the faas trigger type used for the
// span name (`firebase.function.<trigger>`) and `faas.trigger` attribute.
const FUNCTIONS_TRIGGERS: Array<{ channel: string; triggerType: string }> = [
  { channel: CHANNELS.FIREBASE_FUNCTIONS_HTTP_REQUEST, triggerType: 'http.request' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_HTTP_CALL, triggerType: 'http.call' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_CREATED, triggerType: 'firestore.document.created' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_UPDATED, triggerType: 'firestore.document.updated' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_DELETED, triggerType: 'firestore.document.deleted' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_WRITTEN, triggerType: 'firestore.document.written' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_SCHEDULER, triggerType: 'scheduler.scheduled' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_FINALIZED, triggerType: 'storage.object.finalized' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_ARCHIVED, triggerType: 'storage.object.archived' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_DELETED, triggerType: 'storage.object.deleted' },
  { channel: CHANNELS.FIREBASE_FUNCTIONS_STORAGE_METADATA_UPDATED, triggerType: 'storage.object.metadataUpdated' },
];

const NOOP = (): void => {};

/**
 * Runs a span-building callback so a throw inside it can never break the user's firebase call: these run
 * inside the `tracingChannel(...)` machinery wrapping the real function, where an unguarded throw would
 * propagate into the traced call.
 */
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    DEBUG_BUILD && debug.warn('[orchestrion:firebase] error handling channel event', error);
    return undefined;
  }
}

const _firebaseChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        for (const { channel, spanName, useParent } of FIRESTORE_OPERATIONS) {
          bindTracingChannelToSpan(diagnosticsChannel.tracingChannel<FirestoreChannelContext>(channel), data =>
            safe(() => {
              const reference = data.arguments[0] as FirestoreReference | undefined;
              if (!reference) {
                return undefined;
              }
              const spanReference = useParent ? reference.parent || reference : reference;
              return startFirestoreSpan(spanName, spanReference);
            }),
          );
        }

        for (const { channel, triggerType } of FUNCTIONS_TRIGGERS) {
          // Functions are wrapped, not span-bound: the handler runs long after this synchronous
          // registration call, so we only rewrap the handler argument here (in `start`) and open the
          // span inside that wrapper. The other lifecycle events are irrelevant, so no-op them.
          diagnosticsChannel.tracingChannel(channel).subscribe({
            start: data => void safe(() => wrapFunctionsRegistration(data as { arguments: unknown[] }, triggerType)),
            end: NOOP,
            asyncStart: NOOP,
            asyncEnd: NOOP,
            error: NOOP,
          });
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven firebase integration.
 *
 * Subscribes to the `orchestrion:@firebase/firestore:*` and `orchestrion:firebase-functions:*`
 * diagnostics_channels the orchestrion code transform injects into firestore's `addDoc`/`getDocs`/
 * `setDoc`/`deleteDoc` and firebase-functions' `onX` registration functions, emitting spans identical
 * to the OTel integration — with a distinct `auto.firebase.orchestrion.*` origin. Requires the
 * orchestrion runtime hook or bundler plugin — wire it up via `experimentalUseDiagnosticsChannelInjection()`.
 *
 * @experimental
 */
export const firebaseChannelIntegration = defineIntegration(_firebaseChannelIntegration);
