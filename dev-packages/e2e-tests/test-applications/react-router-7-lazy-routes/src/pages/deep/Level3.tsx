import React from 'react';
import { useParams } from 'react-router-dom';

export default function Level3() {
  const { id } = useParams();
  return (
    <div>
      <h1>Level 3 Deep Route</h1>
      <p id="deep-level3">Deeply nested route loaded!</p>
      <p id="deep-level3-id">ID: {id}</p>
    </div>
  );
}
