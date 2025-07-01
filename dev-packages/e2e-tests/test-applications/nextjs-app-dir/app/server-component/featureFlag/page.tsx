import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export default async function FeatureFlagServerComponent() {
  Sentry.buildLaunchDarklyFlagUsedHandler();
  Sentry.launchDarklyIntegration();
  Sentry.openFeatureIntegration();
  Sentry.statsigIntegration();
  Sentry.unleashIntegration();
  Sentry.OpenFeatureIntegrationHook();

  return <div>FeatureFlagServerComponent</div>;
}
