import { defineEventHandler } from '#imports';
import mysql from 'mysql';

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
