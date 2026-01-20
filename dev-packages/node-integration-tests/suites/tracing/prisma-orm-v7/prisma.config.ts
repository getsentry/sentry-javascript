import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  migrate: {
    migrations: './prisma/migrations',
  },
  datasource: {
    url: 'postgresql://prisma:prisma@localhost:5435/tests',
  },
});
