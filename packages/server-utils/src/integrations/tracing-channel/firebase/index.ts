import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { instrumentFirebase } from './instrumentation';

const INTEGRATION_NAME = 'Firebase' as const;

const _firebaseChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        instrumentFirebase();
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
 * orchestrion runtime hook or bundler plugin.
 */
export const firebaseChannelIntegration = defineIntegration(_firebaseChannelIntegration);
