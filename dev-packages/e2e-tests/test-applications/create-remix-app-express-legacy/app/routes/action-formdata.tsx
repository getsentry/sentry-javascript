import { json } from '@remix-run/node';
import { Form } from '@remix-run/react';

export async function action() {
  return json({ message: 'success' });
}

export default function ActionFormData() {
  return (
    <Form method="post" action="/action-formdata" navigate={false}>
      <input type="text" name="text" />
      <input type="file" name="file" />

      <button type="submit">submit</button>
    </Form>
  );
}
