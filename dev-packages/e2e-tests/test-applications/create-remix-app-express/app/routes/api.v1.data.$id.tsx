import { LoaderFunction, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader: LoaderFunction = async ({ params }) => {
  return json({ id: params.id });
};

export default function ApiV1Data() {
  const data = useLoaderData<{ id: string }>();

  return (
    <div>
      <h1>api/v1/data/{data.id}</h1>
    </div>
  );
}
