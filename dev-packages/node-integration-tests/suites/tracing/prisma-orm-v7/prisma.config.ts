import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: './prisma/migrations',
  datasource: {
    url: 'postgresql://prisma:prisma@localhost:5435/tests',
  },
});
