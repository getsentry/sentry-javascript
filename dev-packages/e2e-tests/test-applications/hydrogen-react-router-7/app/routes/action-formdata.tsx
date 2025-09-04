import { Form } from 'react-router';

export async function action() {
  return { message: 'success' };
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
