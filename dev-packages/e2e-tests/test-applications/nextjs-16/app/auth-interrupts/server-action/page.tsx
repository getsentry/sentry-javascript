import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { forbidden, unauthorized } from 'next/navigation';

export default function AuthInterruptsServerActionPage() {
  async function forbiddenServerAction() {
    'use server';
    return await Sentry.withServerActionInstrumentation('forbiddenServerAction', { headers: await headers() }, () => {
      forbidden();
    });
  }

  async function unauthorizedServerAction() {
    'use server';
    return await Sentry.withServerActionInstrumentation(
      'unauthorizedServerAction',
      { headers: await headers() },
      () => {
        unauthorized();
      },
    );
  }

  return (
    <>
      <form action={forbiddenServerAction}>
        <button type="submit">Run Forbidden Action</button>
      </form>
      <form action={unauthorizedServerAction}>
        <button type="submit">Run Unauthorized Action</button>
      </form>
    </>
  );
}
