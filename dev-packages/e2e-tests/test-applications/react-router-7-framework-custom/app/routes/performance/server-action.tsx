import { Form } from 'react-router';
import type { Route } from './+types/server-action';
import * as Sentry from '@sentry/react-router';

export const action = Sentry.wrapServerAction({}, async ({ request }: Route.ActionArgs) => {
  let formData = await request.formData();
  let name = formData.get('name');
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    greeting: `Hola ${name}`,
  };
});

export default function Project({ actionData }: Route.ComponentProps) {
  return (
    <div>
      <h1>Server action page</h1>
      <Form method="post">
        <input type="text" name="name" />
        <button type="submit">Submit</button>
      </Form>
      {actionData ? <p>{actionData.greeting}</p> : null}
    </div>
  );
}
