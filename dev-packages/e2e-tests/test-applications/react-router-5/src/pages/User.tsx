import * as React from 'react';

const User = (params: { id: string }) => {
  return <p>Show user details for {params.id}</p>;
};

export default User;
