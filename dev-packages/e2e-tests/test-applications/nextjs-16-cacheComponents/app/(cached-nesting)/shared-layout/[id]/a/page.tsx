import { headers } from 'next/headers';
import { DynamicBox } from '@/components/scenarioBox';

export default async function Page() {
  await headers();
  return (
    <DynamicBox label="route a · awaits headers">
      <p id="route-a">Route a: {Date.now()}</p>
    </DynamicBox>
  );
}
