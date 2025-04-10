import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export default function ServerComponent() {
  async function myServerAction(formData: FormData) {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'myServerAction',
      { formData, headers: headers(), recordResponse: true },
      async () => {
        await fetch('https://example.com/');
        return { city: 'Vienna' };
      },
    );
  }

  async function notFoundServerAction(formData: FormData) {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'notFoundServerAction',
      { formData, headers: headers(), recordResponse: true },
      () => {
        notFound();
      },
    );
  }

  async function redirectServerAction(formData: FormData) {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'redirectServerAction',
      { formData, headers: headers(), recordResponse: true },
      () => {
        redirect('/');
      },
    );
  }

  return (
    <>
      {/* @ts-ignore */}
      <form action={myServerAction}>
        <input type="text" defaultValue={'some-default-value'} name="some-text-value" />
        <button type="submit">Run Action</button>
      </form>
      {/* @ts-ignore */}
      <form action={notFoundServerAction}>
        <input type="text" defaultValue={'some-default-value'} name="some-text-value" />
        <button type="submit">Run NotFound Action</button>
      </form>
      {/* @ts-ignore */}
      <form action={redirectServerAction}>
        <input type="text" defaultValue={'some-default-value'} name="some-text-value" />
        <button type="submit">Run Redirect Action</button>
      </form>
    </>
  );
}
