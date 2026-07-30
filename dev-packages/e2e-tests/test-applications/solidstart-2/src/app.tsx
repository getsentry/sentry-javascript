import { withSentryRouterRouting } from '@sentry/solidstart/solidrouter';
import { MetaProvider, Title } from '@solidjs/meta';
import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense } from 'solid-js';

const SentryRouter = withSentryRouterRouting(Router);

export default function App() {
  return (
    <SentryRouter
      root={props => (
        <MetaProvider>
          <Title>SolidStart - with Vitest</Title>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </SentryRouter>
  );
}
