import Link from 'next/link';

const HealthyPage = (): JSX.Element => (
  // @ts-expect-error https://nextjs.org/docs/api-reference/next/link#if-the-child-is-a-custom-component-that-wraps-an-a-tag
  <Link href="/alsoHealthy" passHref legacyBehavior>
    <a id="alsoHealthy">AlsoHealthy</a>
  </Link>
);

export default HealthyPage;
