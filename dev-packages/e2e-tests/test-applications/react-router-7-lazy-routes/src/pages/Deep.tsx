import React from 'react';
import { Outlet } from 'react-router-dom';

export default function Deep() {
  return (
    <div>
      <h1>Deep Route Root</h1>
      <p id="deep-root">You are at the deep route root</p>
      <Outlet />
    </div>
  );
}
