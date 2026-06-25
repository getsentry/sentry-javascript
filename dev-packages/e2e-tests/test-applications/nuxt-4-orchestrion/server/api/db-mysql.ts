import mysql from 'mysql';
import { defineEventHandler } from '#imports';

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

export default defineEventHandler(() => {
  return new Promise(resolve => {
    connection.query('SELECT 1 + 1 AS solution', () => {
      connection.query('SELECT NOW()', ['1', '2'], () => {
        resolve({ status: 'ok' });
      });
    });
  });
});
