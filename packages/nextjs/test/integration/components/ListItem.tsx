import Link from 'next/link';
// biome-ignore lint/nursery/noUnusedImports: Need React import for JSX
import React from 'react';

import { User } from '../interfaces';

type Props = {
  data: User;
};

const ListItem = ({ data }: Props) => (
  <Link href="/users/[id]" as={`/users/${data.id}`}>
    <a>
      {data.id}: {data.name}
    </a>
  </Link>
);

export default ListItem;
