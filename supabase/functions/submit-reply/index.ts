import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const response = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req: Request) => {
 if (req.method === 'OPTIONS') return new Response('ok', { headers });
 if (req.method !== 'POST') return response(405, { error: 'Method not allowed.' });
 try {
  if (Number(req.headers.get('content-length') || 0) > 10000) return response(413, { error: 'Message is too long.' });
  const body = await req.json();
  if (body.website) return response(400, { error: 'Unable to send.' });
  if (typeof body.message !== 'string') return response(400, { error: 'Please write a message.' });
  const message = body.message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!message || [...message].length > 2000) return response(400, { error: 'Please write a message of up to 2000 characters.' });
  // Supabase's gateway supplies this header. Never trust a client-provided X-Forwarded-For.
  const ip = req.headers.get('cf-connecting-ip');
  const salt = Deno.env.get('RATE_LIMIT_SALT');
  if (!ip || !salt) return response(503, { error: 'Reply service is temporarily unavailable.' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await client.rpc('submit_limited_reply', { p_key: key, p_message: message });
  if (error) { console.error('Reply database error', error.code); return response(500, { error: 'Could not send your message. Please try again.' }); }
  if (!data) return response(429, { error: 'Too many messages. Please try again later.' });
  return response(200, { ok: true });
 } catch { return response(400, { error: 'Invalid request.' }); }
});
