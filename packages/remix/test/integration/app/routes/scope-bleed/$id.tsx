import { json, LoaderFunction } from '@remix-run/node';

import * as Sentry from '@sentry/remix';

export const loader: LoaderFunction = async ({ params: { id } }) => {
  // Set delay to simulate requests at the same time
  await new Promise(resolve => setTimeout(resolve, parseInt(id || '', 10) * 1000 - 1000));
  Sentry.setTag(`tag${id}`, id);
  return json({ test: 'test' });
};

export default function ScopeBleed() {
  return (
    <div>
      <h1>Hello</h1>
    </div>
  );
}
