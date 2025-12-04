'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function SpotlightEnvTestPage() {
  const [envVars, setEnvVars] = useState<Record<string, string | undefined>>({});
  const [spotlightIntegrationFound, setSpotlightIntegrationFound] = useState(false);

  useEffect(() => {
    // Check environment variables
    // @ts-expect-error - accessing process.env for testing
    const processEnv = typeof process !== 'undefined' && process.env ? process.env : {};

    setEnvVars({
      NEXT_PUBLIC_SENTRY_SPOTLIGHT: processEnv.NEXT_PUBLIC_SENTRY_SPOTLIGHT,
      // @ts-expect-error - SENTRY_SPOTLIGHT should not be accessible in browser
      SENTRY_SPOTLIGHT: processEnv.SENTRY_SPOTLIGHT,
    });

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
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: {envVars.NEXT_PUBLIC_SENTRY_SPOTLIGHT || 'undefined'}
        </div>
        <div data-testid="sentry-spotlight">SENTRY_SPOTLIGHT: {envVars.SENTRY_SPOTLIGHT || 'undefined'}</div>
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
