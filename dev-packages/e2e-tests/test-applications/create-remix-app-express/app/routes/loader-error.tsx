import { LoaderFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export default function LoaderError() {
  useLoaderData();

  return (
    <div>
      <h1>Loader Error</h1>
    </div>
  );
}

export const loader: LoaderFunction = () => {
  throw new Error('Loader Error');
};
