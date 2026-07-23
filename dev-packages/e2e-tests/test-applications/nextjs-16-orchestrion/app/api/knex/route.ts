import knex from 'knex';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = knex({
    client: 'pg',
    connection: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'docker',
      database: 'postgres',
    },
  });

  try {
    await db.schema.dropTableIfExists('knex_users');
    await db.schema.createTable('knex_users', table => {
      table.increments('id').primary();
      table.text('name').notNullable();
    });

    await db('knex_users').insert({ name: 'bob' });
    await db('knex_users').select('*');

    return NextResponse.json({ status: 'ok' });
  } finally {
    await db.schema.dropTableIfExists('knex_users');
    await db.destroy();
  }
}
