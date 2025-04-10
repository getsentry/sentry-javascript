import { ActionFunction, ActionFunctionArgs, json, redirect } from '@remix-run/node';
import { useActionData } from '@remix-run/react';
import { LoaderFunctionArgs } from '@remix-run/router';

export const loader = async ({ params: { id } }: LoaderFunctionArgs) => {
  if (id === '-100') {
    throw new Error('Unexpected Server Error');
  }

  return null;
};

export const action: ActionFunction = async ({ params: { id } }: ActionFunctionArgs) => {
  if (id === '-1') {
    throw new Error('Unexpected Server Error');
  }

  if (id === '-2') {
    // Note: This GET request triggers the `Loader` of the URL, not the `Action`.
    throw redirect('/action-json-response/-100');
  }

  if (id === '-3') {
    throw json({}, { status: 500, statusText: 'Sentry Test Error' });
  }

  if (id === '-4') {
    throw json({ data: 1234 }, { status: 500 });
  }

  if (id === '-5') {
    throw json('Sentry Test Error [string body]', { status: 500 });
  }

  if (id === '-6') {
    throw json({}, { status: 500 });
  }

  return json({ test: 'test' });
};

export default function ActionJSONResponse() {
  const data = useActionData<typeof action>();

  return (
    <div>
      <h1>{data?.test ? data.test : 'Not Found'}</h1>
    </div>
  );
}
