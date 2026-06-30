import * as Sentry from '@sentry/node';
import { Connection, Request, TYPES } from 'tedious';

const config = {
  server: '127.0.0.1',
  authentication: {
    type: 'default',
    options: {
      userName: 'sa',
      password: 'TESTing123',
    },
  },
  options: {
    port: 1433,
    encrypt: false,
    rowCollectionOnRequestCompletion: true,
  },
};

const PROCEDURE_NAME = '[dbo].[test_proced]';
const PREPARED_TABLE = '[dbo].[test_prepared]';
const BULK_TABLE = 'test_bulk';

function connect() {
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);
    connection.on('connect', err => (err ? reject(err) : resolve(connection)));
    if (connection.state !== connection.STATE.CONNECTING) {
      connection.connect();
    }
  });
}

function query(connection, sql, method = 'execSql') {
  return new Promise((resolve, reject) => {
    const request = new Request(sql, err => (err ? reject(err) : resolve()));
    connection[method](request);
  });
}

function callProcedure(connection) {
  return new Promise((resolve, reject) => {
    const request = new Request(PROCEDURE_NAME, err => (err ? reject(err) : resolve()));
    request.addParameter('inputVal', TYPES.VarChar, 'hello world');
    request.addOutputParameter('outputCount', TYPES.Int);
    connection.callProcedure(request);
  });
}

function prepare(connection) {
  return new Promise((resolve, reject) => {
    const request = new Request(`INSERT INTO ${PREPARED_TABLE} VALUES (@val1, @val2)`, err => {
      if (err) reject(err);
    });
    request.addParameter('val1', TYPES.Int);
    request.addParameter('val2', TYPES.Int);
    request.on('prepared', () => resolve(request));
    connection.prepare(request);
  });
}

function execute(connection, request) {
  return new Promise((resolve, reject) => {
    request.on('error', reject);
    request.on('requestCompleted', () => resolve());
    connection.execute(request, { val1: 1, val2: 2 });
  });
}

function bulkLoad(connection) {
  return new Promise((resolve, reject) => {
    const request = connection.newBulkLoad(BULK_TABLE, { keepNulls: true }, err => (err ? reject(err) : resolve()));
    request.addColumn('c1', TYPES.Int, { nullable: true });
    request.addColumn('c2', TYPES.NVarChar, { length: 50, nullable: true });
    connection.execBulkLoad(request, [{ c1: 1 }, { c1: 2, c2: 'hello' }]);
  });
}

async function run() {
  const connection = await connect();

  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    await query(connection, 'SELECT 1 + 1 AS solution');
    await query(connection, 'SELECT 42; SELECT 42;', 'execSqlBatch');

    await query(connection, 'select !').catch(() => {});

    await query(
      connection,
      `CREATE OR ALTER PROCEDURE ${PROCEDURE_NAME} @inputVal varchar(30), @outputCount int OUTPUT AS set @outputCount = LEN(@inputVal);`,
    );
    await callProcedure(connection);

    await query(
      connection,
      `if object_id('${PREPARED_TABLE}') is null CREATE TABLE ${PREPARED_TABLE} (c1 int, c2 int)`,
    );
    const prepared = await prepare(connection);
    await execute(connection, prepared);

    await query(
      connection,
      `if object_id('[dbo].[${BULK_TABLE}]') is null CREATE TABLE [dbo].[${BULK_TABLE}] (c1 int, c2 varchar(30))`,
    );
    await bulkLoad(connection);
  });

  connection.close();
}

run();
