import * as Sentry from '@sentry/nextjs';

// Only `test` is prerendered at build time. `exception` and `message` are generated
// on-demand at request time.
export function generateStaticParams() {
  return [{ id: 'test' }];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === 'exception') {
    Sentry.captureException(new Error('Test error from cache components page'));
    return <p id="result">Error captured for id exception</p>;
  }

  if (id === 'message') {
    Sentry.captureMessage('Test message from cache components page');
    return <p id="result">Message captured for id message</p>;
  }

  return <p id="result">Hello, {id}!</p>;
}
