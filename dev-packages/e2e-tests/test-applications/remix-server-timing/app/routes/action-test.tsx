import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

// Route with both loader and action to test POST request Server-Timing

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  return json({ tag });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const name = formData.get('name');
  const tag = formData.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag as string);
  }

  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 10));

  return json({
    success: true,
    message: `Hello, ${name}!`,
    tag,
  });
};

export default function ActionTest() {
  const { tag } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Action Test Route</h1>
      <p>This route tests Server-Timing headers on POST (action) requests.</p>

      <Form method="post">
        <input type="hidden" name="tag" value={tag || ''} />
        <label>
          Name: <input type="text" name="name" defaultValue="Test User" />
        </label>
        <button type="submit">Submit</button>
      </Form>

      {actionData && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#f0f0f0' }}>
          <p>Response: {actionData.message}</p>
          <p>Success: {actionData.success ? 'Yes' : 'No'}</p>
        </div>
      )}
    </div>
  );
}
