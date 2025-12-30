import type { Route } from './+types/with-middleware';
import type { User } from '../../context';
import { userContext } from '../../context';
import * as Sentry from '@sentry/react-router';

async function getUser() {
  await new Promise(resolve => setTimeout(resolve, 500));
  return {
    id: '1',
    name: 'Carlos Gomez',
  };
}

const authMiddleware: Route.MiddlewareFunction = async ({ request, context }, next) => {
  Sentry.startSpan({ name: 'authMiddleware', op: 'middleware.auth' }, async () => {
    const user: User = await getUser();
    context.set(userContext, user);
    await next();
  });
};

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export const loader = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(userContext);
  return { user };
};

export default function WithMiddlewarePage({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <div>
      <h1>With Middleware Page</h1>
      <p>User: {user?.name}</p>
    </div>
  );
}
