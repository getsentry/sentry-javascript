import * as Sentry from '@sentry/remix';
import { useEffect, useState } from 'react';

export default function RouteProvider() {
  const [route, setRoute] = useState<string>();

  useEffect(() => {
    setRoute(Sentry.resolveCurrentRoute() ?? 'unresolved');
  }, []);

  return <div id="resolved-route">{route}</div>;
}
