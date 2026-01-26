import { Form, useActionData } from 'react-router';
import { submitForm } from './actions';
import type { Route } from './+types/server-function';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  return submitForm(formData);
}

export default function ServerFunctionPage() {
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Server Function Test</h1>
      <p>This page tests wrapServerFunction instrumentation.</p>

      <Form method="post">
        <label htmlFor="name">Name:</label>
        <input type="text" id="name" name="name" defaultValue="Sentry User" />
        <button type="submit" id="submit">
          Submit
        </button>
      </Form>

      {actionData && (
        <div data-testid="result">
          <p>Success: {String(actionData.success)}</p>
          <p data-testid="message">Message: {actionData.message}</p>
        </div>
      )}
    </main>
  );
}
