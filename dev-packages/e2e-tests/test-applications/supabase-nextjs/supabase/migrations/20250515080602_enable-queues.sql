-- Enable queues
create extension if not exists "pgmq";
select pgmq.create('todos');
alter table "pgmq"."q_todos" enable row level security;

--- The following code is vendored in from the supabase implementation for now
--- By default, the pgmq schema is not exposed to the public
--- And there is no other way to enable access locally without using the UI
--- Vendored from: https://github.com/supabase/supabase/blob/aa9070c9087ce8c37a27e7c74ea0353858aed6c2/apps/studio/data/database-queues/database-queues-toggle-postgrest-mutation.ts#L18-L191
create schema if not exists pgmq_public;
grant usage on schema pgmq_public to postgres, anon, authenticated, service_role;

create or replace function pgmq_public.pop(
    queue_name text
)
  returns setof pgmq.message_record
  language plpgsql
  set search_path = ''
as $$
begin
    return query
    select *
    from pgmq.pop(
        queue_name := queue_name
    );
end;
$$;

comment on function pgmq_public.pop(queue_name text) is 'Retrieves and locks the next message from the specified queue.';


create or replace function pgmq_public.send(
    queue_name text,
    message jsonb,
    sleep_seconds integer default 0  -- renamed from 'delay'
)
  returns setof bigint
  language plpgsql
  set search_path = ''
as $$
begin
    return query
    select *
    from pgmq.send(
        queue_name := queue_name,
        msg := message,
        delay := sleep_seconds
    );
end;
$$;

comment on function pgmq_public.send(queue_name text, message jsonb, sleep_seconds integer) is 'Sends a message to the specified queue, optionally delaying its availability by a number of seconds.';


create or replace function pgmq_public.send_batch(
    queue_name text,
    messages jsonb[],
    sleep_seconds integer default 0  -- renamed from 'delay'
)
  returns setof bigint
  language plpgsql
  set search_path = ''
as $$
begin
    return query
    select *
    from pgmq.send_batch(
        queue_name := queue_name,
        msgs := messages,
        delay := sleep_seconds
    );
end;
$$;

comment on function pgmq_public.send_batch(queue_name text, messages jsonb[], sleep_seconds integer) is 'Sends a batch of messages to the specified queue, optionally delaying their availability by a number of seconds.';


create or replace function pgmq_public.archive(
    queue_name text,
    msg_ids bigint[]
)
  returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
    msg_id bigint;
    success boolean := true;
begin
    foreach msg_id in array msg_ids
    loop
        if not pgmq.archive(queue_name := queue_name, msg_id := msg_id) then
            success := false;
        end if;
    end loop;
    return success;
end;
$$;

comment on function pgmq_public.archive(queue_name text, msg_ids bigint[]) is 'Archives multiple messages by moving them from the queue to a permanent archive.';


create or replace function pgmq_public.delete(
    queue_name text,
    message_id bigint
)
  returns boolean
  language plpgsql
  set search_path = ''
as $$
begin
    return
    pgmq.delete(
        queue_name := queue_name,
        msg_id := message_id
    );
end;
$$;

comment on function pgmq_public.delete(queue_name text, message_id bigint) is 'Permanently deletes a message from the specified queue.';

create or replace function pgmq_public.read(
    queue_name text,
    sleep_seconds integer,
    n integer
)
  returns setof pgmq.message_record
  language plpgsql
  set search_path = ''
as $$
begin
    return query
    select *
    from pgmq.read(
        queue_name := queue_name,
        vt := sleep_seconds,
        qty := n
    );
end;
$$;

comment on function pgmq_public.read(queue_name text, sleep_seconds integer, n integer) is 'Reads up to "n" messages from the specified queue with an optional "sleep_seconds" (visibility timeout).';

-- Create receive function (alias for read with different parameter names for E2E test compatibility)
create or replace function pgmq_public.receive(
    queue_name text,
    vt integer,
    qty integer
)
  returns setof pgmq.message_record
  language plpgsql
  set search_path = ''
as $$
begin
    return query
    select *
    from pgmq.read(
        queue_name := queue_name,
        vt := vt,
        qty := qty
    );
end;
$$;

comment on function pgmq_public.receive(queue_name text, vt integer, qty integer) is 'Alias for read() - reads messages from the specified queue with visibility timeout.';

-- Grant execute permissions on wrapper functions to roles
grant execute on function pgmq_public.pop(text) to postgres, service_role, anon, authenticated;
grant execute on function pgmq.pop(text) to postgres, service_role, anon, authenticated;

grant execute on function pgmq_public.send(text, jsonb, integer) to postgres, service_role, anon, authenticated;
grant execute on function pgmq.send(text, jsonb, integer) to postgres, service_role, anon, authenticated;

grant execute on function pgmq_public.send_batch(text, jsonb[], integer) to postgres, service_role, anon, authenticated;
grant execute on function pgmq.send_batch(text, jsonb[], integer) to postgres, service_role, anon, authenticated;

grant execute on function pgmq_public.receive(text, integer, integer) to postgres, service_role, anon, authenticated;

grant execute on function pgmq_public.archive(text, bigint[]) to postgres, service_role, anon, authenticated;

grant execute on function pgmq_public.delete(text, bigint) to postgres, service_role, anon, authenticated;
grant execute on function pgmq.delete(text, bigint) to postgres, service_role, anon, authenticated;

grant execute on function pgmq_public.read(text, integer, integer) to postgres, service_role, anon, authenticated;

-- For the service role, we want full access
-- Grant permissions on existing tables
grant all privileges on all tables in schema pgmq to postgres, service_role;

-- Ensure service_role has permissions on future tables
alter default privileges in schema pgmq grant all privileges on tables to postgres, service_role;

grant usage on schema pgmq to postgres, anon, authenticated, service_role;


/*
  Grant access to sequences to API roles by default. Existing table permissions
  continue to enforce insert restrictions. This is necessary to accommodate the
  on-backup hook that rebuild queue table primary keys to avoid a pg_dump segfault.
  This can be removed once logical backups are completely retired.
*/
grant usage, select, update
on all sequences in schema pgmq
to anon, authenticated, service_role;

alter default privileges in schema pgmq
grant usage, select, update
on sequences
to anon, authenticated, service_role;

-- Create additional queues for E2E flow tests
select pgmq.create('e2e-flow-queue');
select pgmq.create('batch-flow-queue');

-- Lightweight RPC used by tests to verify non-queue instrumentation
create or replace function public.get_supabase_status()
returns jsonb
language sql
stable
as
$$
    select jsonb_build_object('status', 'ok');
$$;

grant execute on function public.get_supabase_status() to authenticated, anon;
