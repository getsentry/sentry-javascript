import * as Sentry from '@sentry/react';
// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import * as React from 'react';
import { Route, Routes } from 'react-router-dom';

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

const InnerRoute = () => (
  <SentryRoutes>
    <Route path=":innerId" element={<p id="content">I am a lazy loaded user</p>} />
  </SentryRoutes>
);

export default InnerRoute;
