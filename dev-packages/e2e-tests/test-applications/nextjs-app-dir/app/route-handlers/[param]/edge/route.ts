import { getDefaultIsolationScope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function PATCH() {
  return NextResponse.json({ name: 'John Doe' }, { status: 401 });
}

export async function DELETE(): Promise<Response> {
  Sentry.setTag('my-isolated-tag', true);
  Sentry.setTag('my-global-scope-isolated-tag', getDefaultIsolationScope().getScopeData().tags['my-isolated-tag']); // We set this tag to be able to assert that the previously set tag has not leaked into the global isolation scope

  throw new Error('route-handler-edge-error');
}
