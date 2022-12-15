import Link from 'next/link';

const HealthyPage = (): JSX.Element => (
  // @ts-ignore
  <Link href="/alsoHealthy" passHref legacyBehavior>
    <a id="alsoHealthy">AlsoHealthy</a>
  </Link>
);

export default HealthyPage;
