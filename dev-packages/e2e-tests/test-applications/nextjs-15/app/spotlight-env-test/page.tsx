'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// Next.js replaces process.env.NEXT_PUBLIC_* at BUILD TIME with literal values
// So we capture them here as constants that get embedded in the bundle
const NEXT_PUBLIC_SPOTLIGHT_VALUE = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;
// SENTRY_SPOTLIGHT is server-only and should NOT be available in client code
const SENTRY_SPOTLIGHT_VALUE = process.env.SENTRY_SPOTLIGHT;

export default function SpotlightEnvTestPage() {
  const [spotlightIntegrationFound, setSpotlightIntegrationFound] = useState(false);

  useEffect(() => {
    // Check if Spotlight integration is registered
    const client = Sentry.getClient();
    const integration = client?.getIntegrationByName?.('SpotlightBrowser');
    setSpotlightIntegrationFound(!!integration);
  }, []);

  return (
    <div>
      <h1>Spotlight Environment Variable Test</h1>
      <div id="env-vars" data-testid="env-vars">
        <h2>Environment Variables</h2>
        <div data-testid="next-public-spotlight">
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: {NEXT_PUBLIC_SPOTLIGHT_VALUE || 'undefined'}
        </div>
        <div data-testid="sentry-spotlight">SENTRY_SPOTLIGHT: {SENTRY_SPOTLIGHT_VALUE || 'undefined'}</div>
      </div>
      <div id="spotlight-status" data-testid="spotlight-status">
        <h2>Spotlight Integration Status</h2>
        <div data-testid="spotlight-integration-found">
          Spotlight Integration: {spotlightIntegrationFound ? 'ENABLED' : 'DISABLED'}
        </div>
      </div>
    </div>
  );
}
