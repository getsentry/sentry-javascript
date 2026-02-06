import { Form, useActionData } from 'react-router';
import { submitFormArrow } from './actions';
import type { Route } from './+types/server-function-arrow';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  return submitFormArrow(formData);
}

export default function ServerFunctionArrowPage() {
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Server Function Arrow Test</h1>
      <p>This tests export const arrow function wrapping.</p>

      <Form method="post">
        <label htmlFor="name">Name:</label>
        <input type="text" id="name" name="name" defaultValue="Arrow User" />
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
