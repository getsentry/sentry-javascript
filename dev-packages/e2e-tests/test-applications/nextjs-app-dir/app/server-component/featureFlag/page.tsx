import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export default async function FeatureFlagServerComponent() {
  Sentry.buildLaunchDarklyFlagUsedHandler();
  Sentry.launchDarklyIntegration();
  Sentry.openFeatureIntegration();
  new Sentry.OpenFeatureIntegrationHook();
  // @ts-ignore - we just want to test that the statsigIntegration is imported
  Sentry.statsigIntegration();
  // @ts-ignore - we just want to test that the unleashIntegration is imported
  Sentry.unleashIntegration();

  return <div>FeatureFlagServerComponent</div>;
}
