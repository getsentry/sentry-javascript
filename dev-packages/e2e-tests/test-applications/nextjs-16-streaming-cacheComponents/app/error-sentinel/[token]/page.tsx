import * as Sentry from '@sentry/nextjs';

// Captures an error tagged with a caller-supplied unique token. Tests use this as a drain marker: the
// token guarantees a cache miss, so the capture always happens on request, and its arrival proves the
// event pipeline has drained past every earlier request.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  Sentry.captureException(new Error(`error-sentinel-${token}`));

  return <p id="sentinel">{token}</p>;
}
