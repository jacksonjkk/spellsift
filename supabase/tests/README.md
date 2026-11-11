# SQL tests

These tests exercise the Supabase RPCs, game lifecycle, and RLS boundary against
a real Postgres database. They are intentionally separate from the Vitest suite
because they need a database with the schema applied.

## Run with Docker

```bash
docker run --rm -d \
  --name spellsift-pg \
  -e POSTGRES_PASSWORD=postgres \
  -p 55432:5432 \
  postgres:16-alpine

export PGPASSWORD=postgres
export PG="psql -h 127.0.0.1 -p 55432 -U postgres"

$PG -d postgres -c 'CREATE DATABASE spellsift_test;'
$PG -d spellsift_test -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql
$PG -d spellsift_test -v ON_ERROR_STOP=1 -f supabase/schema.sql
$PG -d spellsift_test -v ON_ERROR_STOP=1 -f supabase/seed/dictionary.sql
$PG -d spellsift_test -v ON_ERROR_STOP=1 -f supabase/tests/flow.sql
$PG -d spellsift_test -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql

docker stop spellsift-pg
```

`flow.sql` inserts fixed user UUIDs, so it must run on a fresh database. The RLS
test reuses the room created by `flow.sql`.

## Upgrade migration check

To prove migration `009_security_and_integrity.sql` upgrades the previous
committed schema, run it against a database loaded from the old schema:

```bash
$PG -d postgres -c 'CREATE DATABASE spellsift_old;'
$PG -d spellsift_old -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql
git show HEAD~1:supabase/schema.sql > /tmp/old-schema.sql
$PG -d spellsift_old -v ON_ERROR_STOP=1 -f /tmp/old-schema.sql
$PG -d spellsift_old -v ON_ERROR_STOP=1 -f supabase/migrations/009_security_and_integrity.sql
$PG -d spellsift_old -v ON_ERROR_STOP=1 -f supabase/tests/flow.sql
$PG -d spellsift_old -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

If your previous schema is not at `HEAD~1`, substitute the commit hash that
contains the pre-hardening schema.
