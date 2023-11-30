import { LoaderFunction, json } from '@remix-run/node';

import * as Sentry from '@sentry/remix';

export const loader: LoaderFunction = async ({ params: { id } }) => {
  const timeTil = parseInt(id || '', 10) * 1000;
  await new Promise(resolve => setTimeout(resolve, 3000 - timeTil));
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
