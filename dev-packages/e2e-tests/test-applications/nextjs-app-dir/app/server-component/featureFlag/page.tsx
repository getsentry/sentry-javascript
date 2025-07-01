import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export default async function FeatureFlagServerComponent() {
  Sentry.buildLaunchDarklyFlagUsedHandler();

  return <div>FeatureFlagServerComponent</div>;
}
