import { LoaderFunction, defer } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

type LoaderData = { id: string };

export const loader: LoaderFunction = async ({ params: { id } }) => {
  return defer({
    id,
  });
};

export default function LoaderJSONResponse() {
  const data = useLoaderData<LoaderData>();

  return (
    <div>
      <h1 id="data-render">{data && data.id ? data.id : 'Not Found'}</h1>
    </div>
  );
}
