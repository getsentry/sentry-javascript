import { LoaderFunction, redirect } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader: LoaderFunction = async () => {
  throw redirect('/');
};

export default function ThrowRedirect() {
  const data = useLoaderData();
  return <div>{data}</div>;
}
