import { json, LoaderFunction } from '@remix-run/node';

import * as Sentry from '@sentry/remix';

export const loader: LoaderFunction = async ({ params: { id } }) => {
  Sentry.setTag(`tag${id}`, id);

  return json({ test: 'test' });
};

export default function ActionJSONResponse() {
  return (
    <div>
      <h1>Hello</h1>
    </div>
  );
}
