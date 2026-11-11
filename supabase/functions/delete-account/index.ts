// Supabase Edge Function: delete-account
//
// Deletes the calling user's auth account. Profile rows cascade from
// auth.users, and a service-role-only SQL helper migrates or removes any rooms
// the user hosted before the auth row is deleted.
//
// Deploy with:
//   supabase functions deploy delete-account
//
// Required function secrets (provided automatically by Supabase):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('delete-account: missing Supabase function secrets');
    return json({ error: 'Account deletion is not configured.' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'You must be signed in to delete your account.' }, 401);
  }

  // Verify the caller's JWT with the anon client. Never trust a user id from
  // the request body.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const accessToken = authorization.slice('Bearer '.length);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return json({ error: 'Your session has expired. Sign in and try again.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Migrate hosted rooms and mark the user as having left before the profile
  // cascade removes their rows. The helper is executable only by service_role.
  const { error: prepareError } = await admin.rpc('prepare_account_deletion', {
    p_user_id: user.id,
  });

  if (prepareError) {
    console.error('delete-account: prepare_account_deletion failed', prepareError);
    return json({ error: 'Could not prepare your account for deletion. Try again.' }, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error('delete-account: auth.admin.deleteUser failed', deleteError);
    return json({ error: 'Could not delete your account. Try again or contact support.' }, 500);
  }

  return json({ deleted: true });
});
