import { getDefaultIsolationScope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <p>Hello World!</p>;
}

export async function generateMetadata({ searchParams }: { searchParams: any }) {
  Sentry.setTag('my-isolated-tag', true);
  Sentry.setTag('my-global-scope-isolated-tag', getDefaultIsolationScope().getScopeData().tags['my-isolated-tag']); // We set this tag to be able to assert that the previously set tag has not leaked into the global isolation scope

  if (searchParams['shouldThrowInGenerateMetadata']) {
    throw new Error('generateMetadata Error');
  }

  return {
    title: searchParams['metadataTitle'] ?? 'not set',
  };
}

export async function generateViewport({ searchParams }: { searchParams: any }) {
  if (searchParams['shouldThrowInGenerateViewport']) {
    throw new Error('generateViewport Error');
  }

  return {
    themeColor: searchParams['viewportThemeColor'] ?? 'black',
  };
}
