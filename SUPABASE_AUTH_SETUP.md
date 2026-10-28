# Supabase Auth setup for Meoini

## Supabase project

1. Create or select a Supabase project and enable Email authentication.
2. In **Authentication → URL Configuration**, set **Site URL** to:

   `https://xin5818.github.io/meoini/`

3. Add these exact **Redirect URLs**:

   - `https://xin5818.github.io/meoini/`
   - `http://localhost:5173/meoini/`

4. Copy the Project URL and Publishable key from the project's Connect/API settings.

## Local development

Copy `.env.example` to `.env.local`, then replace the placeholder URL and key. Restart the Vite dev server after changing environment variables.

## GitHub Pages build

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The Pages workflow injects these values during the Vite build. The publishable key is intended for browser clients; never add a Supabase `service_role` secret to a Vite variable or client bundle.

Email confirmation links return to the project URL above. Supabase Auth must also have email confirmation enabled/disabled according to the account policy you want.
