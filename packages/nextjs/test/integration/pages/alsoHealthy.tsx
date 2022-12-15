import Link from 'next/link';

const HealthyPage = (): JSX.Element => (
  // @ts-ignore
  <Link href="/healthy" passHref legacyBehavior>
    <a id="healthy">Healthy</a>
  </Link>
);

export default HealthyPage;
