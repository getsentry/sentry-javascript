import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export default async function FeatureFlagServerComponent() {
  Sentry.buildLaunchDarklyFlagUsedHandler();
  Sentry.launchDarklyIntegration();
  Sentry.openFeatureIntegration();
  // @ts-ignore - we just want to test that the statsigIntegration is imported
  Sentry.statsigIntegration();
  // @ts-ignore - we just want to test that the unleashIntegration is imported
  Sentry.unleashIntegration();
  // @ts-ignore - we just want to test that the OpenFeatureIntegrationHook is imported
  Sentry.OpenFeatureIntegrationHook();

  return <div>FeatureFlagServerComponent</div>;
}
