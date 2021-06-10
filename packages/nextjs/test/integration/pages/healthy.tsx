import Link from 'next/link';

const HealthyPage = (): JSX.Element => (
  <Link href="/alsoHealthy">
    <a id="alsoHealthy">AlsoHealthy</a>
  </Link>
);

export default HealthyPage;
