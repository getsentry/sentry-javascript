export const dynamic = 'force-dynamic';

export default async function Page() {
  throw new Error('RSC error');
  return <p>Hello World</p>;
}
