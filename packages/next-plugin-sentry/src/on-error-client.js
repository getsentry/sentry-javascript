import { withScope, captureException } from '@sentry/nextjs';

export default async function onErrorClient({ err }) {
  withScope(scope => {
    captureException(err);
  });
}
