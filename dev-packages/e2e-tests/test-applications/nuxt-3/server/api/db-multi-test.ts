import { defineEventHandler, getQuery, useDatabase } from '#imports';

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const method = query.method as string;

  switch (method) {
    case 'default-db': {
      // Test default database instance
      const db = useDatabase();
      await db.exec('CREATE TABLE IF NOT EXISTS default_table (id INTEGER PRIMARY KEY, data TEXT)');
      await db.exec(`INSERT OR REPLACE INTO default_table (id, data) VALUES (1, 'default data')`);
      const stmt = db.prepare('SELECT * FROM default_table WHERE id = ?');
      const result = await stmt.get(1);
      return { success: true, database: 'default', result };
    }

    case 'users-db': {
      // Test named database instance 'users'
      const usersDb = useDatabase('users');
      await usersDb.exec(
        'CREATE TABLE IF NOT EXISTS user_profiles (id INTEGER PRIMARY KEY, username TEXT, email TEXT)',
      );
      await usersDb.exec(
        `INSERT OR REPLACE INTO user_profiles (id, username, email) VALUES (1, 'john_doe', 'john@example.com')`,
      );
      const stmt = usersDb.prepare('SELECT * FROM user_profiles WHERE id = ?');
      const result = await stmt.get(1);
      return { success: true, database: 'users', result };
    }

    case 'analytics-db': {
      // Test named database instance 'analytics'
      const analyticsDb = useDatabase('analytics');
      await analyticsDb.exec(
        'CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, event_name TEXT, count INTEGER)',
      );
      await analyticsDb.exec(`INSERT OR REPLACE INTO events (id, event_name, count) VALUES (1, 'page_view', 100)`);
      const stmt = analyticsDb.prepare('SELECT * FROM events WHERE id = ?');
      const result = await stmt.get(1);
      return { success: true, database: 'analytics', result };
    }

    case 'multiple-dbs': {
      // Test operations across multiple databases in a single request
      const defaultDb = useDatabase();
      const usersDb = useDatabase('users');
      const analyticsDb = useDatabase('analytics');

      // Create tables and insert data in all databases
      await defaultDb.exec('CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, token TEXT)');
      await defaultDb.exec(`INSERT OR REPLACE INTO sessions (id, token) VALUES (1, 'session-token-123')`);

      await usersDb.exec('CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, account_name TEXT)');
      await usersDb.exec(`INSERT OR REPLACE INTO accounts (id, account_name) VALUES (1, 'Premium Account')`);

      await analyticsDb.exec(
        'CREATE TABLE IF NOT EXISTS metrics (id INTEGER PRIMARY KEY, metric_name TEXT, value REAL)',
      );
      await analyticsDb.exec(
        `INSERT OR REPLACE INTO metrics (id, metric_name, value) VALUES (1, 'conversion_rate', 0.25)`,
      );

      // Query from all databases
      const sessionResult = await defaultDb.prepare('SELECT * FROM sessions WHERE id = ?').get(1);
      const accountResult = await usersDb.prepare('SELECT * FROM accounts WHERE id = ?').get(1);
      const metricResult = await analyticsDb.prepare('SELECT * FROM metrics WHERE id = ?').get(1);

      return {
        success: true,
        results: {
          default: sessionResult,
          users: accountResult,
          analytics: metricResult,
        },
      };
    }

    case 'sql-template-multi': {
      // Test SQL template tag across multiple databases
      const defaultDb = useDatabase();
      const usersDb = useDatabase('users');

      await defaultDb.exec('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, message TEXT)');
      await usersDb.exec('CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, action TEXT)');

      const defaultResult = await defaultDb.sql`INSERT INTO logs (message) VALUES (${'test message'})`;
      const usersResult = await usersDb.sql`INSERT INTO audit_logs (action) VALUES (${'user_login'})`;

      return {
        success: true,
        results: {
          default: defaultResult,
          users: usersResult,
        },
      };
    }

    default:
      return { error: 'Unknown method' };
  }
});
