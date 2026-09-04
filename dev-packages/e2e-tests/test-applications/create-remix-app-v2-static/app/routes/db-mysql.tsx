import mysql from 'mysql';

export async function loader() {
  const connection = mysql.createConnection({
    user: 'root',
    password: 'docker',
  });

  try {
    await new Promise<void>((resolve, reject) => {
      connection.query('SELECT 1 + 1 AS solution', err => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      connection.query('SELECT NOW()', ['1', '2'], err => (err ? reject(err) : resolve()));
    });
    return { status: 'ok' };
  } finally {
    connection.end();
  }
}

export default function DbMysql() {
  return <div>db-mysql</div>;
}
