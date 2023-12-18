export const dynamic = 'force-dynamic';

export default function Page() {
  return <p>Hello World!</p>;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  if (searchParams['shouldThrowInGenerateMetadata']) {
    throw new Error('generateMetadata Error');
  }

  return {
    title: searchParams['metadataTitle'] ?? 'not set',
  };
}

export function generateViewport({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  if (searchParams['shouldThrowInGenerateViewport']) {
    throw new Error('generateViewport Error');
  }

  return {
    themeColor: searchParams['viewportThemeColor'] ?? 'black',
  };
}
