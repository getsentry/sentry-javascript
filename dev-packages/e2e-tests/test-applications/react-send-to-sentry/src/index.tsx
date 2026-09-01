import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Route,
  Routes,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import Index from './pages/Index';
import User from './pages/User';

const replay = Sentry.replayIntegration();

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.REACT_APP_E2E_TEST_DSN,
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    replay,
  ],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  release: 'e2e-test',

  // Always capture replays, so we can test this properly
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 0.0,

  // Streamed spans never become transaction events, so the pageload and navigation segments are
  // recorded here instead of in the event processor below. They are looked up by span id.
  beforeSendSpan(span) {
    const op = span.attributes['sentry.op'];

    if (span.is_segment && typeof op === 'string' && (op === 'pageload' || op === 'navigation')) {
      window.recordedSegmentSpans = window.recordedSegmentSpans || [];
      window.recordedSegmentSpans.push({ spanId: span.span_id, traceId: span.trace_id, op });
    }

    return span;
  },
});

Object.defineProperty(window, 'sentryReplayId', {
  get() {
    return replay['_replay'].session.id;
  },
});

// The trace id is recorded alongside the event id because events are looked up through the
// organization trace endpoint, which is keyed by trace rather than by event.
Sentry.addEventProcessor(event => {
  const eventId = event.event_id;
  const traceId = event.contexts?.trace?.trace_id;

  if (eventId && traceId && !event.type && event.exception) {
    window.capturedException = { eventId, traceId };
  }

  return event;
});

const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <BrowserRouter>
    <SentryRoutes>
      <Route path="/" element={<Index />} />
      <Route path="/user/:id" element={<User />} />
    </SentryRoutes>
  </BrowserRouter>,
);
