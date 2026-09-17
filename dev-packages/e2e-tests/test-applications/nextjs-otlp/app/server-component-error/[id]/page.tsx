export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  throw new Error(`This is a server component error with id ${id}`);
}
