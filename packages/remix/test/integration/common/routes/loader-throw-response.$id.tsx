import { LoaderFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader: LoaderFunction = async ({ params: { id } }) => {
  if (id === '-1') {
    throw new Response(null, {
      status: 500,
      statusText: 'Not found',
    });
  }

  return { message: 'hello world' };
};

export default function LoaderThrowResponse() {
  const data = useLoaderData();

  return (
    <div>
      <h1>Loader Throw Response</h1>
      <span>{data ? data.message : 'No Data'} </span>
    </div>
  );
}
