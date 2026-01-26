import { useLoaderData } from 'react-router';
import type { LoaderFunction } from 'react-router';

export const loader: LoaderFunction = async ({ params }) => {
  const { id } = params as { id: string };
  if (id === '-1') {
    throw new Error('Unexpected Server Error');
  }

  return null;
};

export default function LoaderError() {
  const data = useLoaderData() as { test?: string };

  return (
    <div>
      <h1>{data && data.test ? data.test : 'Not Found'}</h1>
    </div>
  );
}
