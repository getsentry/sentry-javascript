// fixme: this needs to be imported from @sentry/core, not @sentry/nuxt in dev mode (because of import-in-the-middle error)
// This could also be a problem with the specific setup of the pnpm E2E test setup, because this could not be reproduced outside of the E2E test.
// Related to this: https://github.com/getsentry/sentry-javascript/issues/15204#issuecomment-2948908130
import { setTag } from '@sentry/nuxt';

export default function useSentryTestTag(): void {
  setTag('test-tag', null);
}
