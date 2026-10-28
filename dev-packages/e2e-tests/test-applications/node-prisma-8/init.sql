CREATE SCHEMA prisma_contract;
CREATE TABLE prisma_contract.contract (
    core_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contract_json jsonb NOT NULL
);
CREATE TABLE prisma_contract.ledger (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    space text NOT NULL,
    migration_name text NOT NULL,
    migration_hash text NOT NULL,
    origin_core_hash text,
    origin_profile_hash text,
    destination_core_hash text NOT NULL,
    destination_profile_hash text,
    operations jsonb NOT NULL
);
CREATE SEQUENCE prisma_contract.ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE prisma_contract.ledger_id_seq OWNED BY prisma_contract.ledger.id;
CREATE TABLE prisma_contract.marker (
    space text DEFAULT 'app'::text NOT NULL,
    core_hash text NOT NULL,
    profile_hash text NOT NULL,
    contract_json jsonb,
    canonical_version integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    app_tag text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    invariants text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE public."User" (
    email text NOT NULL,
    id integer NOT NULL,
    name text
);
CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;
ALTER TABLE ONLY prisma_contract.ledger ALTER COLUMN id SET DEFAULT nextval('prisma_contract.ledger_id_seq'::regclass);
ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);
INSERT INTO prisma_contract.contract VALUES ('a62d15a094e80be7b342d75e0538935972b9699c76dabb5339940dd50d17a889', '2026-10-08 14:56:22.624077+00', '{"meta": {}, "roots": {"User": {"model": "User", "namespace": "public"}}, "domain": {"namespaces": {"public": {"models": {"User": {"fields": {"id": {"many": false, "type": {"kind": "scalar", "codecId": "pg/int4@1"}, "nullable": false}, "name": {"many": false, "type": {"kind": "scalar", "codecId": "pg/text@1"}, "nullable": true}, "email": {"many": false, "type": {"kind": "scalar", "codecId": "pg/text@1"}, "nullable": false}}, "storage": {"table": "User", "fields": {"id": {"column": "id"}, "name": {"column": "name"}, "email": {"column": "email"}}, "namespaceId": "public"}, "relations": {}}}}}}, "target": "postgres", "storage": {"namespaces": {"public": {"id": "public", "entries": {"table": {"User": {"columns": {"id": {"many": false, "codecId": "pg/int4@1", "default": {"kind": "function", "expression": "autoincrement()"}, "dataType": "pg/int4", "nullable": false}, "name": {"many": false, "codecId": "pg/text@1", "dataType": "pg/text", "nullable": true}, "email": {"many": false, "codecId": "pg/text@1", "dataType": "pg/text", "nullable": false}}, "indexes": [], "uniques": [{"columns": ["email"]}], "primaryKey": {"columns": ["id"]}, "foreignKeys": []}}}}}, "storageHash": "a62d15a094e80be7b342d75e0538935972b9699c76dabb5339940dd50d17a889"}, "extensions": {}, "profileHash": "3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2", "capabilities": {"sql": {"enums": true, "lockOf": true, "lateral": true, "forShare": true, "forUpdate": true, "returning": true, "lockNowait": true, "scalarList": true, "lockSkipLocked": true, "checkConstraint": true, "defaultInInsert": true, "insertOnConflictSkip": true, "insertOnConflictWithoutTarget": true}, "postgres": {"limit": true, "jsonAgg": true, "lateral": true, "orderBy": true, "returning": true, "distinctOn": true, "forKeyShare": true, "forNoKeyUpdate": true}}, "targetFamily": "sql"}');
INSERT INTO prisma_contract.ledger VALUES (1, '2026-10-08 14:56:22.624077+00', 'app', '', 'a62d15a094e80be7b342d75e0538935972b9699c76dabb5339940dd50d17a889', '', NULL, 'a62d15a094e80be7b342d75e0538935972b9699c76dabb5339940dd50d17a889', NULL, '[{"id": "table.User", "label": "Create table \"User\"", "target": {"id": "postgres", "details": {"name": "User", "schema": "public", "objectType": "table"}}, "execute": [{"sql": "CREATE TABLE \"public\".\"User\" (\n  \"email\" text NOT NULL,\n  \"id\" SERIAL NOT NULL,\n  \"name\" text,\n  PRIMARY KEY (\"id\")\n)", "params": [], "description": "create table \"User\""}], "summary": "Creates table \"User\"", "precheck": [{"sql": "SELECT (to_regclass($1)) IS NULL AS \"result\"", "params": ["\"public\".\"User\""], "description": "ensure table \"User\" does not exist"}], "postcheck": [{"sql": "SELECT (to_regclass($1)) IS NOT NULL AS \"result\"", "params": ["\"public\".\"User\""], "description": "verify table \"User\" exists"}], "operationClass": "additive"}, {"id": "unique.User.User_email_key", "label": "Add unique constraint on \"User\" (email)", "target": {"id": "postgres", "details": {"name": "User_email_key", "table": "User", "schema": "public", "objectType": "unique"}}, "execute": [{"sql": "ALTER TABLE \"public\".\"User\" ADD CONSTRAINT \"User_email_key\" UNIQUE (\"email\")", "description": "add unique constraint \"User_email_key\""}], "precheck": [{"sql": "SELECT NOT EXISTS (SELECT 1 AS \"one\" FROM \"pg_constraint\" AS \"c\" INNER JOIN \"pg_namespace\" AS \"n\" ON \"n\".\"oid\" = \"c\".\"connamespace\" WHERE (\"c\".\"conname\" = $1 AND \"n\".\"nspname\" = $2 AND \"c\".\"conrelid\" = to_regclass($3))) AS \"result\"", "params": ["User_email_key", "public", "\"public\".\"User\""], "description": "ensure constraint \"User_email_key\" does not exist"}], "postcheck": [{"sql": "SELECT EXISTS (SELECT 1 AS \"one\" FROM \"pg_constraint\" AS \"c\" INNER JOIN \"pg_namespace\" AS \"n\" ON \"n\".\"oid\" = \"c\".\"connamespace\" WHERE (\"c\".\"conname\" = $1 AND \"n\".\"nspname\" = $2 AND \"c\".\"conrelid\" = to_regclass($3))) AS \"result\"", "params": ["User_email_key", "public", "\"public\".\"User\""], "description": "verify constraint \"User_email_key\" exists"}], "operationClass": "additive"}]');
INSERT INTO prisma_contract.marker VALUES ('app', 'a62d15a094e80be7b342d75e0538935972b9699c76dabb5339940dd50d17a889', '3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2', NULL, NULL, '2026-10-08 14:56:22.624077+00', NULL, '{}', '{}');
ALTER TABLE ONLY prisma_contract.contract
    ADD CONSTRAINT contract_pkey PRIMARY KEY (core_hash);
ALTER TABLE ONLY prisma_contract.ledger
    ADD CONSTRAINT ledger_pkey PRIMARY KEY (id);
ALTER TABLE ONLY prisma_contract.marker
    ADD CONSTRAINT marker_pkey PRIMARY KEY (space);
ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_email_key" UNIQUE (email);
ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);
