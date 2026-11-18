import { FindPlanet } from '~/components/FindPlanet';

export default async function ClientErrorPage() {
  return (
    <main>
      <FindPlanet withError />
    </main>
  );
}
