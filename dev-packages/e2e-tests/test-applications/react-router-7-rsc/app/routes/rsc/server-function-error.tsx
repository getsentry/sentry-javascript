import { Form, useActionData } from 'react-router';
import { submitFormWithError } from './actions';
import type { Route } from './+types/server-function-error';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  return submitFormWithError(formData);
}

export default function ServerFunctionErrorPage() {
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Server Function Error Test</h1>
      <Form method="post">
        <input type="hidden" name="trigger" value="error" />
        <button type="submit" id="submit">
          Trigger Server Function Error
        </button>
      </Form>

      {actionData && (
        <div data-testid="result">
          <p>This should not appear - error should be thrown</p>
        </div>
      )}
    </main>
  );
}
