import { Outlet } from '@remix-run/react';

// Overrides the root `meta`, so these pages render no `sentry-trace`/`baggage` meta tags and the
// client has to continue the trace from the `Server-Timing` header instead.
export const meta = () => [];

export default function ServerTimingLayout() {
  return <Outlet />;
}
