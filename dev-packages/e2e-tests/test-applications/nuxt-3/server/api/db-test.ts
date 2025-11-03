import { defineEventHandler, getQuery, useDatabase } from '#imports';

export default defineEventHandler(async event => {
  const db = useDatabase();
  const query = getQuery(event);
  const method = query.method as string;

  switch (method) {
    case 'prepare-get': {
      await db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)');
      await db.exec(`INSERT OR REPLACE INTO users (id, name, email) VALUES (1, 'Test User', 'test@example.com')`);
      const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
      const result = await stmt.get(1);
      return { success: true, result };
    }

    case 'prepare-all': {
      await db.exec('CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT, price REAL)');
      await db.exec(`INSERT OR REPLACE INTO products (id, name, price) VALUES
        (1, 'Product A', 10.99),
        (2, 'Product B', 20.50),
        (3, 'Product C', 15.25)`);
      const stmt = db.prepare('SELECT * FROM products WHERE price > ?');
      const results = await stmt.all(10);
      return { success: true, count: results.length, results };
    }

    case 'prepare-run': {
      await db.exec('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer TEXT, amount REAL)');
      const stmt = db.prepare('INSERT INTO orders (customer, amount) VALUES (?, ?)');
      const result = await stmt.run('John Doe', 99.99);
      return { success: true, result };
    }

    case 'prepare-bind': {
      await db.exec('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, category TEXT, value INTEGER)');
      await db.exec(`INSERT OR REPLACE INTO items (id, category, value) VALUES
        (1, 'electronics', 100),
        (2, 'books', 50),
        (3, 'electronics', 200)`);
      const stmt = db.prepare('SELECT * FROM items WHERE category = ?');
      const boundStmt = stmt.bind('electronics');
      const results = await boundStmt.all();
      return { success: true, count: results.length, results };
    }

    case 'sql': {
      await db.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, content TEXT, created_at TEXT)');
      const timestamp = new Date().toISOString();
      const results = await db.sql`INSERT INTO messages (content, created_at) VALUES (${'Hello World'}, ${timestamp})`;
      return { success: true, results };
    }

    case 'exec': {
      await db.exec('DROP TABLE IF EXISTS logs');
      await db.exec('CREATE TABLE logs (id INTEGER PRIMARY KEY, message TEXT, level TEXT)');
      const result = await db.exec(`INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')`);
      return { success: true, result };
    }

    case 'error': {
      const stmt = db.prepare('SELECT * FROM nonexistent_table WHERE invalid_column = ?');
      await stmt.get(1);
      return { success: false, message: 'Should have thrown an error' };
    }

    default:
      return { error: 'Unknown method' };
  }
});
