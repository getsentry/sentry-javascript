import { withSentryReactRouterV6Routing } from '@sentry/react/reactrouterv6';
import * as React from 'react';
import { Route, Routes } from 'react-router-dom';

const SentryRoutes = withSentryReactRouterV6Routing(Routes);

const InnerRoute = () => (
  <SentryRoutes>
    <Route path=":innerId" element={<p id="content">I am a lazy loaded user</p>} />
  </SentryRoutes>
);

export default InnerRoute;
