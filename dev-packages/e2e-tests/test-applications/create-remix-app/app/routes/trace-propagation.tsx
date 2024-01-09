import { LoaderFunction, json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

type LoaderData = { traceId: string; paramsId: string };

export const loader: LoaderFunction = async () => {
  const transaction = Sentry.getActiveTransaction();

  let traceId = null;

  if (transaction) {
    traceId = transaction.traceId;
  }

  return json({
    traceId,
  });
};

export default function TracePropagation() {
  const data = useLoaderData<LoaderData>();

  return (
    <div>
      <Link to="/trace-propagation-navigated" id="navigation">
        navigate
      </Link>
      <span id="trace-id">{data && data.traceId ? data.traceId : 'Not Found'}</span>
    </div>
  );
}
