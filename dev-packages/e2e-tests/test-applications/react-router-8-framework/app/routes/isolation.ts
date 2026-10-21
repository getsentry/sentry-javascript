import * as Sentry from '@sentry/react-router';
import type { Route } from './+types/isolation';

const waitingRequests = new Map<string, () => void>();

// Holds the first of two requests until the second one has set its tag, so both requests use their scopes at the
// same time.
function waitForPartner(id: string, partner: string): Promise<void> {
  const releasePartner = waitingRequests.get(partner);
  if (releasePartner) {
    waitingRequests.delete(partner);
    releasePartner();
    return Promise.resolve();
  }
  return new Promise(resolve => waitingRequests.set(id, resolve));
}

export async function loader({ params, request }: Route.LoaderArgs) {
  Sentry.setTag('isolation-id', params.id);

  const partner = new URL(request.url).searchParams.get('partner');
  if (partner) {
    await waitForPartner(params.id, partner);
  }

  Sentry.captureMessage(`isolation ${params.id}`);
  return Response.json({ id: params.id });
}
