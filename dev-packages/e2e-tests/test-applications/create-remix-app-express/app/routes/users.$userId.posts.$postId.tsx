import { LoaderFunction, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader: LoaderFunction = async ({ params }) => {
  return json({ userId: params.userId, postId: params.postId });
};

export default function UserPost() {
  const data = useLoaderData<{ userId: string; postId: string }>();

  return (
    <div>
      <h1>
        User {data.userId} / Post {data.postId}
      </h1>
    </div>
  );
}
