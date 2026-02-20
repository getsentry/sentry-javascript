import { json, LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';

export const loader = async ({ params }: LoaderFunctionArgs) => {
  await new Promise(resolve => setTimeout(resolve, 10));
  return json({ userId: params.id });
};

export default function User() {
  const { userId } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>User {userId}</h1>
      <p>This is a parameterized route for user {userId}.</p>
      <Link to="/">Back to Home</Link>
    </div>
  );
}
