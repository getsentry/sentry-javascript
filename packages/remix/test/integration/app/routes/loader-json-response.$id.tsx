import { LoaderFunction, json, redirect } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

type LoaderData = { id: string };

export const loader: LoaderFunction = async ({ params: { id } }) => {
  if (id === '-2') {
    throw new Error('Unexpected Server Error');
  }

  if (id === '-1') {
    throw redirect('/loader-json-response/-2');
  }

  return json({
    id,
  });
};

export default function LoaderJSONResponse() {
  const data = useLoaderData<LoaderData>();

  return (
    <div>
      <h1>{data?.id ? data.id : 'Not Found'}</h1>
    </div>
  );
}
