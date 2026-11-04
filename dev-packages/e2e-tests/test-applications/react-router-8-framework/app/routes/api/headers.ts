import type { Route } from './+types/headers';

export function loader({ request }: Route.LoaderArgs) {
  return Response.json({
    'sentry-trace': request.headers.get('sentry-trace'),
    baggage: request.headers.get('baggage'),
  });
}
