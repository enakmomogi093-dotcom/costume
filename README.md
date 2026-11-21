# KENZ Customer Service

Dark premium customer/admin chat portal built with React + Vite + Supabase, deployable to Vercel.

## Features
- Phone OTP login and username profile
- Customer room creation with unique room code/link
- Admin inbox, customer identity display, room close/reopen
- Realtime message refresh through Supabase Realtime
- Image upload to Supabase Storage (5 MB limit)
- Row Level Security policies for profiles, rooms, messages and storage

## 1. Create Supabase project
1. Create a project at https://supabase.com.
2. Open SQL Editor and run all of `supabase/schema.sql`.
3. In Authentication > Providers, enable Phone.
4. Configure an SMS provider supported by Supabase Auth and set the SMS template.
5. For production, configure OTP rate limits and CAPTCHA in Supabase Auth settings.

**WhatsApp note:** This starter uses Supabase Phone OTP with `type: 'sms'`. It verifies control of the phone number, but does not prove that the number has an active WhatsApp account. It does not send WhatsApp messages. WhatsApp OTP requires a separately configured WhatsApp Business Platform/approved authentication provider and a server-side integration.

## 2. Local setup
```bash
npm install
cp .env.example .env
```
Fill `.env`:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```
Then:
```bash
npm run dev
```

## 3. Make your account an admin
1. Sign in once using the phone OTP flow.
2. In Supabase SQL Editor run:
```sql
update public.profiles
set role = 'admin'
where phone = '+6281234567890';
```
3. Sign out and sign back in. Admin role is stored in the database and protected by RLS. Do not add a public admin-registration button.

## 4. Deploy to Vercel
1. Push this project to a private GitHub repository.
2. In Vercel choose Add New > Project and import the repository.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Project Settings > Environment Variables.
4. Deploy. `vercel.json` provides SPA fallback routing.

## Security / production checklist
- Never put Supabase `service_role` key in `.env` or frontend.
- Keep RLS enabled. Review policies before opening the service publicly.
- Set strict OTP rate limits and CAPTCHA.
- Restrict allowed image types and file size; current client limit is 5 MB by Storage bucket.
- Public image bucket means anyone with an image URL can view that image. For private support photos, change bucket to private and implement signed URL access.
- Add abuse reporting, moderation, retention policy and backups before public launch.
- Add an admin account only by trusted SQL/dashboard access.
- This is a starter app, not a fully audited production helpdesk.
