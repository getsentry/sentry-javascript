// This is a server component, NOT a client component.
// "use client" — this comment should be ignored by the Sentry plugin.

import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/server-component-comment-directive';

async function ServerComponentWithCommentDirective({ loaderData }: Route.ComponentProps) {
  await new Promise(resolve => setTimeout(resolve, 10));

  return (
    <main>
      <h1 data-testid="title">Server Component With Comment Directive</h1>
      <p data-testid="loader-message">Message: {loaderData?.message ?? 'No loader data'}</p>
    </main>
  );
}

export default wrapServerComponent(ServerComponentWithCommentDirective, {
  componentRoute: '/rsc/server-component-comment-directive',
  componentType: 'Page',
});

export async function loader() {
  return { message: 'Hello from comment-directive server component!' };
}
