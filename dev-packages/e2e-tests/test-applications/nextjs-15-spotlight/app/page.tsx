'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// Next.js replaces process.env.NEXT_PUBLIC_* at BUILD TIME with literal values
const NEXT_PUBLIC_SPOTLIGHT_VALUE = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;

export default function SpotlightTestPage() {
  const [spotlightEnabled, setSpotlightEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if Spotlight integration is registered
    const client = Sentry.getClient();
    const integration = client?.getIntegrationByName?.('SpotlightBrowser');
    setSpotlightEnabled(!!integration);

    // Log for debugging
    console.log('Spotlight test results:', {
      envValue: NEXT_PUBLIC_SPOTLIGHT_VALUE,
      integrationFound: !!integration,
      clientExists: !!client,
    });
  }, []);

  return (
    <div>
      <h1>Next.js Spotlight Auto-Enablement Test</h1>

      <div data-testid="env-value">
        <h2>Environment Variable</h2>
        <p>NEXT_PUBLIC_SENTRY_SPOTLIGHT: {NEXT_PUBLIC_SPOTLIGHT_VALUE || 'undefined'}</p>
      </div>

      <div data-testid="spotlight-status">
        <h2>Spotlight Integration Status</h2>
        <p data-testid="spotlight-enabled">
          {spotlightEnabled === null ? 'Loading...' : spotlightEnabled ? 'ENABLED' : 'DISABLED'}
        </p>
      </div>
    </div>
  );
}
