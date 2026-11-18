import { getDefaultIsolationScope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | undefined>>;

export default function Page() {
  return <p>Hello World!</p>;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  Sentry.setTag('my-isolated-tag', true);
  Sentry.setTag('my-global-scope-isolated-tag', getDefaultIsolationScope().getScopeData().tags['my-isolated-tag']); // We set this tag to be able to assert that the previously set tag has not leaked into the global isolation scope

  if (params['shouldThrowInGenerateMetadata']) {
    throw new Error('generateMetadata Error');
  }

  return {
    title: params['metadataTitle'] ?? 'not set',
  };
}

export async function generateViewport({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  if (params['shouldThrowInGenerateViewport']) {
    throw new Error('generateViewport Error');
  }

  return {
    themeColor: params['viewportThemeColor'] ?? 'black',
  };
}
