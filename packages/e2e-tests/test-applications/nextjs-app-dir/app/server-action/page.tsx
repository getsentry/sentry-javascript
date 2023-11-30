import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';

export default function ServerComponent() {
  async function myServerAction(formData: FormData) {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'myServerAction',
      { formData, headers: headers(), recordResponse: true },
      async () => {
        await fetch('http://example.com/');
        return { city: 'Vienna' };
      },
    );
  }

  return (
    // @ts-ignore
    <form action={myServerAction}>
      <input type="text" defaultValue={'some-default-value'} name="some-text-value" />
      <button type="submit">Run Action</button>
    </form>
  );
}
