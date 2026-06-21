-- Diagnostic query to check current RLS policies on rooms table
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'rooms'
ORDER BY policyname;
