export default async function I18nTestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div>
      <h1>I18n Test Page</h1>
      <p>Current locale: {locale || 'default'}</p>
      <p>This page tests i18n route parameterization</p>
    </div>
  );
}
