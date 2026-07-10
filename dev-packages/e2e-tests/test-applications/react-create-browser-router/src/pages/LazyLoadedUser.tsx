import { withSentryReactRouterV6Routing } from '@sentry/react/reactrouterv6';
import * as React from 'react';
import { Route, Routes } from 'react-router-dom';

const SentryRoutes = withSentryReactRouterV6Routing(Routes);
const InnerRoute = React.lazy(() => import('./LazyLoadedInnerRoute'));

const LazyLoadedUser = () => {
  return (
    <SentryRoutes>
      <Route
        path=":id/*"
        element={
          <React.Suspense fallback={<p>Loading...</p>}>
            <InnerRoute />
          </React.Suspense>
        }
      />
    </SentryRoutes>
  );
};

export default LazyLoadedUser;
