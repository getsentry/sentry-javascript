import { Form } from 'react-router';

export async function action(): Promise<never> {
  throw new Error('Action error for testing');
}

export default function ErrorActionPage() {
  return (
    <div>
      <h1>Error Action Page</h1>
      <Form method="post">
        <button type="submit">Trigger Error</button>
      </Form>
    </div>
  );
}
