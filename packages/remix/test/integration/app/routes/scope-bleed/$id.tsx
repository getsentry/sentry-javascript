import { json, LoaderFunction } from '@remix-run/node';

import * as Sentry from '@sentry/remix';

export const loader: LoaderFunction = async ({ params: { id } }) => {
  // Set delay to simulate requests at the same time
  const randomNum = Math.floor(Math.random() * 15) + 1;
  await new Promise(resolve => setTimeout(resolve, 400 - (parseInt(id || '', 10) * 100 - randomNum)));
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
