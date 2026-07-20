import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { firebaseModuleNames } from '../../../orchestrion/config/firebase';
import { invokeOrchestrionInstrumentation } from '../../../orchestrion/instrumentation';
import { instrumentFirebase } from './instrumentation';

const INTEGRATION_NAME = 'Firebase' as const;

const _firebaseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, firebaseModuleNames, instrumentFirebase, []);
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven firebase integration.
 *
 * Subscribes to the `orchestrion:@firebase/firestore:*` and `orchestrion:firebase-functions:*`
 * diagnostics_channels the orchestrion code transform injects into firestore's `addDoc`/`getDocs`/
 * `setDoc`/`deleteDoc` and firebase-functions' `onX` registration functions, emitting spans identical
 * to the OTel integration. Requires the orchestrion runtime hook or bundler plugin.
 */
export const firebaseIntegration = defineIntegration(_firebaseIntegration);
