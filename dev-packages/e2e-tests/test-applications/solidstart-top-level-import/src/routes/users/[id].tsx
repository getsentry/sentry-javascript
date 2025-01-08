import { withServerActionInstrumentation } from '@sentry/solidstart';
import { createAsync, useParams } from '@solidjs/router';

const getPrefecture = async () => {
  'use server';
  return await withServerActionInstrumentation('getPrefecture', () => {
    return { prefecture: 'Ehime' };
  });
};
export default function User() {
  const params = useParams();
  const userData = createAsync(() => getPrefecture());

  return (
    <div>
      User ID: {params.id}
      <br />
      Prefecture: {userData()?.prefecture}
    </div>
  );
}
