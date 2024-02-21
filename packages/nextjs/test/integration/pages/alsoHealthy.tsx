import Link from 'next/link';

const HealthyPage = (): JSX.Element => (
  // @ts-ignore https://nextjs.org/docs/api-reference/next/link#if-the-child-is-a-custom-component-that-wraps-an-a-tag
  <Link href="/healthy" passHref legacyBehavior>
    <a id="healthy">Healthy</a>
  </Link>
);

export default HealthyPage;
