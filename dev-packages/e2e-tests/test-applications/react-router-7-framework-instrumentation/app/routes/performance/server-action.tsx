import { Form } from 'react-router';
import type { Route } from './+types/server-action';

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = formData.get('name')?.toString() || '';
  await new Promise(resolve => setTimeout(resolve, 100));
  return { success: true, name };
}

export default function ServerActionPage({ actionData }: Route.ComponentProps) {
  return (
    <div>
      <h1>Server Action Page</h1>
      <Form method="post">
        <input type="text" name="name" defaultValue="sentry" />
        <button type="submit">Submit</button>
      </Form>
      {actionData?.success && <div>Action completed for: {actionData.name}</div>}
    </div>
  );
}
