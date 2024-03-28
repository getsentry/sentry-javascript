import { Form } from '@remix-run/react';

export default function Index() {
  return (
    <Form method="POST">
      <input name="test" />
      <input type="file" name="file" />
      <input type="file" multiple name="multifile" />

      <button type="submit">submit</button>
    </Form>
  );
}

export async function action({ request }) {
  const formData = await request.formData();

  console.log('form data', formData.get('test'), formData.get('file'));

  return new Response('ok');
}
