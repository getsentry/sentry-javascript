import { headers } from 'next/headers';
import { DynamicBox } from '@/components/scenarioBox';

export default async function Page() {
  await headers();
  return (
    <DynamicBox label="route b · awaits headers">
      <p id="route-b">Route b: {Date.now()}</p>
    </DynamicBox>
  );
}
