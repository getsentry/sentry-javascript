import { headers } from 'next/headers';
import { DynamicBox } from '@/components/scenarioBox';

export default async function Page() {
  await headers();
  return (
    <DynamicBox label="page · awaits headers">
      <p id="dynamic-leaf">Dynamic leaf: {Date.now()}</p>
    </DynamicBox>
  );
}
