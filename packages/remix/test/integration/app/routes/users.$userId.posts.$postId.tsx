import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return json({
    userId: params.userId,
    postId: params.postId,
    timestamp: Date.now(),
  });
};

export default function UserPost() {
  const data = useLoaderData<typeof loader>();

  return (
    <div>
      <h1>Nested Route Test (Flat Syntax)</h1>
      <p>User ID: {data.userId}</p>
      <p>Post ID: {data.postId}</p>
      <p>Timestamp: {data.timestamp}</p>
    </div>
  );
}
