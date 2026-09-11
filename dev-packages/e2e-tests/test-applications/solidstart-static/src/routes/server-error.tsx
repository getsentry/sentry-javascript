import { withServerActionInstrumentation } from '@sentry/solidstart';
import { createAsync } from '@solidjs/router';

const getPrefecture = async () => {
  'use server';
  return await withServerActionInstrumentation('getPrefecture', () => {
    throw new Error('Error thrown from Solid Start E2E test app server route');

    return { prefecture: 'Kanagawa' };
  });
};

export default function ServerErrorPage() {
  const data = createAsync(() => getPrefecture());

  return <div>Prefecture: {data()?.prefecture}</div>;
}
