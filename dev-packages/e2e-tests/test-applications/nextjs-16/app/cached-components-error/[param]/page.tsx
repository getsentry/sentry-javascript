import * as Sentry from '@sentry/nextjs';

export default async function Page({ searchParams }: { searchParams: any }) {
  const normalizedSearchParams = await searchParams;

  try {
    console.log(normalizedSearchParams.id); // Accessing a field on searchParams will throw the PPR error
  } catch (e) {
    Sentry.captureException(e); // This error should not be reported
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for any async event processors to run
    await Sentry.flush();
    throw e;
  }

  return <div>This server component will throw a Cached Components error that we do not want to catch.</div>;
}
