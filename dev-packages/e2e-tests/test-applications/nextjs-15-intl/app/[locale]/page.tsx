export default async function LocaleRootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div>
      <h1>Locale Root</h1>
      <p>Current locale: {locale}</p>
    </div>
  );
}
