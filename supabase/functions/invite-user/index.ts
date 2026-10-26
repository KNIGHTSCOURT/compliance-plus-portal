// Compliance Plus — invite-user Edge Function.
// Staff only. Creates a one-time sign-in link for a client (or another staff
// member) and grants their access. The link is returned to the portal so it
// can be sent by email, text or WhatsApp — no email server needed.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!me || me.role !== 'staff') return json({ error: 'Only staff can manage logins.' }, 403);

    const body = await req.json();
    const action = body.action;

    if (action === 'invite') {
      const role = body.role === 'staff' ? 'staff' : 'client';
      const email = String(body.email || '').trim().toLowerCase();
      const clientId = role === 'client' ? String(body.clientId || '') : null;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
      if (role === 'client' && !clientId) return json({ error: 'Missing client.' }, 400);
      const redirectTo = String(body.redirectTo || '');
      if (role === 'staff') await admin.from('staff_emails').upsert({ email });

      let r = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } });
      let existing = false;
      if (r.error) {
        // Already has an account: send a set-password link instead.
        existing = true;
        r = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
        if (r.error) return json({ error: r.error.message }, 400);
      }
      const uid = r.data.user!.id;
      const { error: pe } = await admin.from('profiles').upsert({ id: uid, email, role, client_id: clientId });
      if (pe) return json({ error: pe.message }, 400);
      return json({ link: r.data.properties!.action_link, existing });
    }

    if (action === 'revoke') {
      const userId = String(body.userId || '');
      if (userId === user.id) return json({ error: 'You cannot remove your own access.' }, 400);
      const { data: p } = await admin.from('profiles').select('email, role').eq('id', userId).single();
      if (p && p.role === 'staff') await admin.from('staff_emails').delete().eq('email', p.email);
      await admin.from('profiles').update({ role: 'pending', client_id: null }).eq('id', userId);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
