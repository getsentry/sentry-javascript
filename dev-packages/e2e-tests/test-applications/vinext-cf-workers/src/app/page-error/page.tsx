import { connection } from 'next/server';

export default async function PageError() {
  await connection();
  throw new Error('Page render error from vinext');
}
