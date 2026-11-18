import { Outlet, Scripts } from 'react-router';
import type { Route } from './+types/root';

export const middleware: Route.MiddlewareFunction[] = [
  ({ request }, next) => (request.method === 'POST' ? new Response('blocked by user auth', { status: 401 }) : next()),
];

export default function App() {
  return (
    <html lang="en">
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
