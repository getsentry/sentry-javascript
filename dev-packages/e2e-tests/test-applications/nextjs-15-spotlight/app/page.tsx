'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// Next.js replaces process.env.NEXT_PUBLIC_* at BUILD TIME with literal values
const NEXT_PUBLIC_SPOTLIGHT_VALUE = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;

export default function SpotlightTestPage() {
  const [spotlightEnabled, setSpotlightEnabled] = useState<boolean | null>(null);
  const [integrationNames, setIntegrationNames] = useState<string[]>([]);
  const [windowSpotlight, setWindowSpotlight] = useState<string>('loading...');

  useEffect(() => {
    // Read window._sentrySpotlight at runtime
    // @ts-expect-error - accessing window property
    const windowValue = typeof window !== 'undefined' ? window._sentrySpotlight : undefined;
    setWindowSpotlight(String(windowValue ?? 'undefined'));

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
      windowSpotlight: windowValue,
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
        <p>window._sentrySpotlight: {windowSpotlight}</p>
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
