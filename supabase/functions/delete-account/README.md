# delete-account Edge Function

Deletes the signed-in user's account. The client calls it from the Profile page
through `supabase.functions.invoke('delete-account')`.

## Deploy

```bash
supabase functions deploy delete-account
```

`verify_jwt` is enabled by default. The function verifies the caller's JWT with
the anon key, then uses the service-role key only for the final admin delete.

## Database dependency

The function calls `public.prepare_account_deletion(p_user_id)`. That helper is
defined in `supabase/schema.sql` and
`supabase/migrations/009_security_and_integrity.sql`, and is granted only to
`service_role`. It promotes a new host (or removes the room if nobody else is
present) before the auth row is deleted.

## Local testing

```bash
supabase functions serve delete-account --env-file supabase/.env.local
```

Use a test account. Do not point local tests at production.
