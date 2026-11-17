import * as Sentry from '@sentry/react-router';
import type { Route } from './+types/isolation';

const waitingRequests = new Set<string>();

// Holds the first of two requests until the second one has set its tag, so both requests use their scopes at the
// same time. The first request polls on a timer until the second one removes the entry of the first: workerd
// cancels a request that waits with no pending I/O, and a promise must not be resolved from another request.
async function waitForPartner(id: string, partner: string): Promise<void> {
  if (waitingRequests.delete(partner)) {
    return;
  }

  waitingRequests.add(id);
  while (waitingRequests.has(id)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
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
