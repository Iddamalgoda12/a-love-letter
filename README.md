# The heart that speaks

A small, interactive particle-heart experience built with React, Three.js and Supabase. The supplied reference image is for visual direction only; the heart is generated in WebGL.

## Make it yours

Edit `src/config/loveConfig.ts` before sharing: write your own message, add names if desired, and optionally provide a URL to instrumental music you have permission to use. The default text is deliberately a setup instruction, not an invented personal message. Music only starts when the visitor chooses to play it.

## Run locally

Use Node 20.19+ or 22.12+. Run `npm install`, copy `.env.example` to `.env.local` and supply your Supabase project URL and publishable/anon key, then run `npm run dev`. The heart works without backend configuration; sending replies and admin sign-in require it.

## Supabase setup

1. Create a Supabase project and link it with the Supabase CLI (`supabase link --project-ref YOUR_PROJECT_REF`). Apply the migration with `supabase db push`.
2. In Authentication, disable public sign-ups. Create your administrator user via the dashboard and copy its UUID. In the SQL editor run `insert into public.reply_admins (user_id) values ('YOUR_ADMIN_UUID');`. Only explicitly allowlisted users can access replies, even if other users exist.
3. Set a long random `RATE_LIMIT_SALT` using `supabase secrets set RATE_LIMIT_SALT=...`. Deploy with `supabase functions deploy submit-reply --no-verify-jwt`. The function uses the platform-provided service role key only on the server. It requires the platform's `cf-connecting-ip` header; verify that your deployed gateway supplies it. If missing, submissions fail closed. The database applies an atomic limit of five attempts per address per hour and the form includes a honeypot. This is basic abuse protection, not a substitute for CAPTCHA or a dedicated rate-limiting service under sustained attack.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your local and Vercel environment. Never put a service-role key in frontend variables.
5. Visit `/admin`, sign in with the allowlisted user, and test send/read/mark/delete. Check that anonymous and non-allowlisted users cannot query replies. Back up your database according to your needs.

## Deploy

Import this repository into Vercel, configure the two public environment variables, and deploy using the Vite defaults (`npm run build`, output `dist`). The rewrite supports direct access to `/admin`. Do not share the experience until you have personalized the message and verified the deployed reply flow and permissions.

## Notes

The particle count and pixel ratio are capped for mobile; reduced-motion preferences are respected. A glowing text heart remains usable if WebGL is unavailable. Replies are rendered as text, never HTML. Rate limit hashes are stored in `reply_rate_limits`; schedule periodic deletion of old rows if the installation receives substantial traffic. No music track is bundled.
