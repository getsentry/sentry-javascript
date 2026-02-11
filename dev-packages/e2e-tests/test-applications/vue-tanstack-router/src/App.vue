<template>
  <div>
    <nav>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/posts/$postId" :params="{ postId: '1' }">Post 1</Link>
        </li>
        <li>
          <Link to="/posts/$postId" :params="{ postId: '2' }" id="nav-link"> Post 2 </Link>
        </li>
      </ul>
    </nav>
    <hr />
    <Outlet />
  </div>
</template>

<script setup lang="ts">
import { Link, Outlet } from '@tanstack/vue-router';
</script>

<style scoped>
nav ul {
  list-style: none;
  padding: 0;
  display: flex;
  gap: 1rem;
}

nav li {
  display: inline;
}

nav a {
  color: #42b983;
  text-decoration: none;
}

nav a:hover {
  text-decoration: underline;
}
</style>
