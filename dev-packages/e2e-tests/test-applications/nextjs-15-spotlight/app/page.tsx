'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// Next.js replaces process.env.NEXT_PUBLIC_* at BUILD TIME with literal values
const NEXT_PUBLIC_SPOTLIGHT_VALUE = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;
// Check internal values (these may or may not be replaced depending on bundler)
const INTERNAL_SPOTLIGHT_PROCESS_ENV = process.env._sentrySpotlight;
// @ts-expect-error - accessing globalThis for debugging
const INTERNAL_SPOTLIGHT_GLOBAL = typeof globalThis !== 'undefined' ? globalThis._sentrySpotlight : 'globalThis undefined';
// @ts-expect-error - accessing manual global set in instrumentation-client.ts
const MANUAL_SPOTLIGHT_GLOBAL = typeof globalThis !== 'undefined' ? globalThis._sentrySpotlightManual : 'globalThis undefined';
// @ts-expect-error - accessing SDK debug info
const SDK_DEBUG_INFO = typeof globalThis !== 'undefined' ? globalThis._sentrySpotlightDebug : undefined;

export default function SpotlightTestPage() {
  const [spotlightEnabled, setSpotlightEnabled] = useState<boolean | null>(null);
  const [integrationNames, setIntegrationNames] = useState<string[]>([]);

  useEffect(() => {
    // Check if Spotlight integration is registered
    const client = Sentry.getClient();
    const integration = client?.getIntegrationByName?.('SpotlightBrowser');
    setSpotlightEnabled(!!integration);

    // Get all integration names for debugging
    // @ts-expect-error accessing internal property for debugging
    const intNames = client?._integrations ? Object.keys(client._integrations) : [];
    setIntegrationNames(intNames);

    // Log for debugging
    console.log('Spotlight test results:', {
      envValue: NEXT_PUBLIC_SPOTLIGHT_VALUE,
      internalProcessEnv: INTERNAL_SPOTLIGHT_PROCESS_ENV,
      internalGlobal: INTERNAL_SPOTLIGHT_GLOBAL,
      manualGlobal: MANUAL_SPOTLIGHT_GLOBAL,
      sdkDebugInfo: SDK_DEBUG_INFO,
      integrationFound: !!integration,
      clientExists: !!client,
      integrationNames: intNames,
    });
  }, []);

  return (
    <div>
      <h1>Next.js Spotlight Auto-Enablement Test</h1>

      <div data-testid="env-value">
        <h2>Environment Variable</h2>
        <p>NEXT_PUBLIC_SENTRY_SPOTLIGHT: {NEXT_PUBLIC_SPOTLIGHT_VALUE || 'undefined'}</p>
        <p>process.env._sentrySpotlight: {String(INTERNAL_SPOTLIGHT_PROCESS_ENV) || 'undefined'}</p>
        <p>globalThis._sentrySpotlight: {String(INTERNAL_SPOTLIGHT_GLOBAL) || 'undefined'}</p>
        <p>globalThis._sentrySpotlightManual: {String(MANUAL_SPOTLIGHT_GLOBAL) || 'undefined'}</p>
      </div>

      <div data-testid="sdk-debug">
        <h2>SDK Debug Info (what SDK saw during init)</h2>
        <pre>{SDK_DEBUG_INFO ? JSON.stringify(SDK_DEBUG_INFO, null, 2) : 'No debug info'}</pre>
      </div>

      <div data-testid="spotlight-status">
        <h2>Spotlight Integration Status</h2>
        <p data-testid="spotlight-enabled">
          {spotlightEnabled === null ? 'Loading...' : spotlightEnabled ? 'ENABLED' : 'DISABLED'}
        </p>
        <p data-testid="integration-names">
          Integrations: {integrationNames.join(', ') || 'none'}
        </p>
      </div>
    </div>
  );
}
