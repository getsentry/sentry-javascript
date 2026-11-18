import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ServerActionPage() {
  async function myServerAction(formData: FormData) {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'myServerAction',
      { formData, headers: await headers(), recordResponse: true },
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
      { formData, headers: await headers(), recordResponse: true },
      () => {
        notFound();
      },
    );
  }

  async function redirectServerAction(formData: FormData) {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'redirectServerAction',
      { formData, headers: await headers(), recordResponse: true },
      () => {
        redirect('/');
      },
    );
  }

  return (
    <>
      {/* @ts-expect-error The action returns a value so that `recordResponse` has a response to record */}
      <form action={myServerAction}>
        <input type="text" defaultValue={'some-default-value'} name="some-text-value" />
        <button type="submit">Run Action</button>
      </form>
      <form action={notFoundServerAction}>
        <input type="text" defaultValue={'some-default-value'} name="some-text-value" />
        <button type="submit">Run NotFound Action</button>
      </form>
      <form action={redirectServerAction}>
        <input type="text" defaultValue={'some-default-value'} name="some-text-value" />
        <button type="submit">Run Redirect Action</button>
      </form>
    </>
  );
}
