import type { NextPageContext } from 'next';
import * as Sentry from '@sentry/nextjs';

interface ErrorProps {
  statusCode?: number;
  eventId?: string;
  lastEventId?: string;
}

function ErrorPage({ statusCode, eventId, lastEventId }: ErrorProps) {
  return (
    <div>
      <h1>Error Page</h1>
      <p data-testid="status-code">Status Code: {statusCode}</p>
      <p data-testid="event-id">Event ID from return: {eventId || 'No event ID'}</p>
      <p data-testid="last-event-id">Event ID from lastEventId(): {lastEventId || 'No event ID'}</p>
    </div>
  );
}

ErrorPage.getInitialProps = async (context: NextPageContext) => {
  const { res, err } = context;

  const statusCode = res?.statusCode || err?.statusCode || 404;

  // Capture the error using captureUnderscoreErrorException
  // This should return the already-captured event ID from the data fetcher
  const eventId = await Sentry.captureUnderscoreErrorException(context);

  // Also get the last event ID from lastEventId()
  const lastEventId = Sentry.lastEventId();

  return { statusCode, eventId, lastEventId };
};

export default ErrorPage;
