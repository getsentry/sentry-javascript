import { Form, useActionData } from 'react-router';
import defaultAction from './actions-default';
import type { Route } from './+types/server-function-default';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  return defaultAction(formData);
}

export default function ServerFunctionDefaultPage() {
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Server Function Default Export Test</h1>
      <Form method="post">
        <label htmlFor="name">Name:</label>
        <input type="text" id="name" name="name" defaultValue="Default User" />
        <button type="submit" id="submit">
          Submit
        </button>
      </Form>

      {actionData && (
        <div data-testid="result">
          <p data-testid="message">Message: {actionData.message}</p>
        </div>
      )}
    </main>
  );
}
