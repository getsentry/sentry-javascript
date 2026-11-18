import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return json({ userId: params.id });
};

export default function ServerTimingUser() {
  const { userId } = useLoaderData<typeof loader>();

  return <h1>User {userId}</h1>;
}
