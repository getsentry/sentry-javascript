'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// Next.js replaces process.env.NEXT_PUBLIC_* at BUILD TIME with literal values
const NEXT_PUBLIC_SPOTLIGHT_VALUE = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;

// Check globalThis which is where the valueInjectionLoader should put the value
const GLOBALTHIS_SPOTLIGHT_VALUE =
  typeof globalThis !== 'undefined'
    ? (globalThis as Record<string, unknown>)['NEXT_PUBLIC_SENTRY_SPOTLIGHT']
    : undefined;

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
      processEnvValue: NEXT_PUBLIC_SPOTLIGHT_VALUE,
      globalThisValue: GLOBALTHIS_SPOTLIGHT_VALUE,
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
        <p>process.env: {NEXT_PUBLIC_SPOTLIGHT_VALUE || 'undefined'}</p>
        <p data-testid="globalthis-value">globalThis: {String(GLOBALTHIS_SPOTLIGHT_VALUE) || 'undefined'}</p>
      </div>

      <div data-testid="spotlight-status">
        <h2>Spotlight Integration Status</h2>
        <p data-testid="spotlight-enabled">
          {spotlightEnabled === null ? 'Loading...' : spotlightEnabled ? 'ENABLED' : 'DISABLED'}
        </p>
        <p data-testid="integration-names">Integrations: {integrationNames.join(', ') || 'none'}</p>
      </div>
    </div>
  );
}
