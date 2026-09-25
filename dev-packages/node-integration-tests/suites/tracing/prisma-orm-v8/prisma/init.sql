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
CREATE TABLE public."user" (
    email text NOT NULL,
    id integer NOT NULL,
    name text
);
CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;
ALTER TABLE ONLY prisma_contract.ledger ALTER COLUMN id SET DEFAULT nextval('prisma_contract.ledger_id_seq'::regclass);
ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);
INSERT INTO prisma_contract.contract VALUES ('f4e1954fd8bed87828d13c3f1a02164dc9796ef1af76ed6f98184c01263169c5', '2026-09-09 09:15:28.369559+00', '{"meta": {}, "roots": {"user": {"model": "User", "namespace": "public"}}, "domain": {"namespaces": {"public": {"models": {"User": {"fields": {"id": {"type": {"kind": "scalar", "codecId": "pg/int4@1"}, "nullable": false}, "name": {"type": {"kind": "scalar", "codecId": "pg/text@1"}, "nullable": true}, "email": {"type": {"kind": "scalar", "codecId": "pg/text@1"}, "nullable": false}}, "storage": {"table": "user", "fields": {"id": {"column": "id"}, "name": {"column": "name"}, "email": {"column": "email"}}, "namespaceId": "public"}, "relations": {}}}}}}, "target": "postgres", "storage": {"namespaces": {"public": {"id": "public", "entries": {"table": {"user": {"columns": {"id": {"codecId": "pg/int4@1", "default": {"kind": "function", "expression": "autoincrement()"}, "nullable": false, "nativeType": "int4"}, "name": {"codecId": "pg/text@1", "nullable": true, "nativeType": "text"}, "email": {"codecId": "pg/text@1", "nullable": false, "nativeType": "text"}}, "indexes": [], "uniques": [{"columns": ["email"]}], "primaryKey": {"columns": ["id"]}, "foreignKeys": []}}}}}, "storageHash": "f4e1954fd8bed87828d13c3f1a02164dc9796ef1af76ed6f98184c01263169c5"}, "extensions": {}, "profileHash": "3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2", "capabilities": {"sql": {"enums": true, "lateral": true, "returning": true, "scalarList": true, "checkConstraint": true, "defaultInInsert": true}, "postgres": {"limit": true, "jsonAgg": true, "lateral": true, "orderBy": true, "returning": true, "distinctOn": true}}, "targetFamily": "sql"}');
INSERT INTO prisma_contract.ledger VALUES (1, '2026-09-09 09:15:28.369559+00', 'app', '', 'f4e1954fd8bed87828d13c3f1a02164dc9796ef1af76ed6f98184c01263169c5', '', NULL, 'f4e1954fd8bed87828d13c3f1a02164dc9796ef1af76ed6f98184c01263169c5', NULL, '[{"id": "table.user", "label": "Create table \"user\"", "target": {"id": "postgres", "details": {"name": "user", "schema": "public", "objectType": "table"}}, "execute": [{"sql": "CREATE TABLE \"public\".\"user\" (\n  \"email\" text NOT NULL,\n  \"id\" SERIAL NOT NULL,\n  \"name\" text,\n  PRIMARY KEY (\"id\")\n)", "params": [], "description": "create table \"user\""}], "summary": "Creates table \"user\"", "precheck": [{"sql": "SELECT (to_regclass($1)) IS NULL AS \"result\"", "params": ["\"public\".\"user\""], "description": "ensure table \"user\" does not exist"}], "postcheck": [{"sql": "SELECT (to_regclass($1)) IS NOT NULL AS \"result\"", "params": ["\"public\".\"user\""], "description": "verify table \"user\" exists"}], "operationClass": "additive"}, {"id": "unique.user.user_email_key", "label": "Add unique constraint on \"user\" (email)", "target": {"id": "postgres", "details": {"name": "user_email_key", "table": "user", "schema": "public", "objectType": "unique"}}, "execute": [{"sql": "ALTER TABLE \"public\".\"user\" ADD CONSTRAINT \"user_email_key\" UNIQUE (\"email\")", "description": "add unique constraint \"user_email_key\""}], "precheck": [{"sql": "SELECT NOT EXISTS (SELECT 1 AS \"one\" FROM \"pg_constraint\" AS \"c\" INNER JOIN \"pg_namespace\" AS \"n\" ON \"n\".\"oid\" = \"c\".\"connamespace\" WHERE (\"c\".\"conname\" = $1 AND \"n\".\"nspname\" = $2 AND \"c\".\"conrelid\" = to_regclass($3))) AS \"result\"", "params": ["user_email_key", "public", "\"public\".\"user\""], "description": "ensure constraint \"user_email_key\" does not exist"}], "postcheck": [{"sql": "SELECT EXISTS (SELECT 1 AS \"one\" FROM \"pg_constraint\" AS \"c\" INNER JOIN \"pg_namespace\" AS \"n\" ON \"n\".\"oid\" = \"c\".\"connamespace\" WHERE (\"c\".\"conname\" = $1 AND \"n\".\"nspname\" = $2 AND \"c\".\"conrelid\" = to_regclass($3))) AS \"result\"", "params": ["user_email_key", "public", "\"public\".\"user\""], "description": "verify constraint \"user_email_key\" exists"}], "operationClass": "additive"}]');
INSERT INTO prisma_contract.marker VALUES ('app', 'f4e1954fd8bed87828d13c3f1a02164dc9796ef1af76ed6f98184c01263169c5', '3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2', NULL, NULL, '2026-09-09 09:15:28.369559+00', NULL, '{}', '{}');
ALTER TABLE ONLY prisma_contract.contract
    ADD CONSTRAINT contract_pkey PRIMARY KEY (core_hash);
ALTER TABLE ONLY prisma_contract.ledger
    ADD CONSTRAINT ledger_pkey PRIMARY KEY (id);
ALTER TABLE ONLY prisma_contract.marker
    ADD CONSTRAINT marker_pkey PRIMARY KEY (space);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);
