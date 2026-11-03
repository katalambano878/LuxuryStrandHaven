/**
 * Reset admin user password via Supabase Admin API.
 * Run: node --env-file=.env.local scripts/reset-admin-password.mjs
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.RESET_USER_ID;
const newPassword = process.env.RESET_PASSWORD;

if (!userId || !newPassword || newPassword.length < 12) {
  console.error('Set RESET_USER_ID and RESET_PASSWORD (at least 12 characters).');
  process.exit(1);
}

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  },
  body: JSON.stringify({ password: newPassword }),
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Error:', data.msg || data.message || res.statusText);
  process.exit(1);
}
console.log('Password reset successfully.');
console.log('Email: admin@luxurystrandhaven.com');
console.log('New password: ' + newPassword);
