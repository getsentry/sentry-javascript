import { Form } from 'react-router';

export function clientAction() {
  throw new Error('Madonna mia! Che casino nella Client Action!');
}

export default function ClientActionErrorPage() {
  return (
    <div>
      <h1>Client Error Action Page</h1>
      <Form method="post">
        <button id="submit" type="submit">
          Submit
        </button>
      </Form>
    </div>
  );
}
