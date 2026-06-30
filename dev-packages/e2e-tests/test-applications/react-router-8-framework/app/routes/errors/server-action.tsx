import { Form } from 'react-router';

export function action() {
  throw new Error('Madonna mia! Che casino nella Server Action!');
}

export default function ServerActionErrorPage() {
  return (
    <div>
      <h1>Server Error Action Page</h1>
      <Form method="post">
        <button id="submit" type="submit">
          Submit
        </button>
      </Form>
    </div>
  );
}
