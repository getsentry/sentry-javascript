export const dynamic = 'force-dynamic';

export const runtime = 'edge';

export default async function Page() {
  throw new Error('Edge Server Component Error');
}
