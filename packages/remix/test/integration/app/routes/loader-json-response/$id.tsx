import { json, LoaderFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

type LoaderData = { id: string };

export const loader: LoaderFunction = async ({ params: { id } }) => {
  if (id === '-1') {
    throw new Error('Error');
  }

  return json({
    id,
  });
};

export default function LoaderJSONResponse() {
  const data = useLoaderData<LoaderData>();

  return (
    <div>
      <h1>{data.id}</h1>
    </div>
  );
}
