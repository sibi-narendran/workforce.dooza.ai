# Integrate accounts.dooza.ai with workforce.dooza.ai

workforce.dooza.ai has been updated to receive auth via accounts.dooza.ai. The flow is:

```
User visits workforce.dooza.ai
  -> no session -> redirect to accounts.dooza.ai/signin?product=workforce
  -> user signs in/up on accounts
  -> accounts callback redirects to https://workforce.dooza.ai#access_token=...&refresh_token=...
  -> workforce detects hash tokens, exchanges them via POST /api/auth/exchange
  -> session established, user lands on /employees
```

Below are the changes needed on the **accounts.dooza.ai** side.

---

## 1. Run SQL in workforce's Supabase

Before swapping env vars, run this SQL in workforce's Supabase project (`cydhvvqvgrvntzitrrwy`) via the SQL Editor. This creates the tables that accounts.dooza.ai's `handle_new_user()` trigger expects.

### Tables

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  password_text text,
  intended_product text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.product_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  product text NOT NULL,
  role text DEFAULT 'member',
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, org_id, product)
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can view their orgs" ON public.organizations FOR SELECT
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.product_access WHERE org_id = organizations.id AND user_id = auth.uid()));
CREATE POLICY "Users can view own access" ON public.product_access FOR SELECT USING (user_id = auth.uid());
```

### Trigger (auto-creates user/org/access on signup)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
  v_intended_product text;
  v_first_name text;
BEGIN
  v_intended_product := new.raw_user_meta_data->>'intended_product';
  v_first_name := new.raw_user_meta_data->>'first_name';

  INSERT INTO public.users (id, email, first_name, last_name, phone, password_text, intended_product)
  VALUES (new.id, new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'password',
    v_intended_product)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  SELECT id INTO v_org_id FROM public.organizations WHERE owner_id = new.id LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, owner_id)
    VALUES (COALESCE(v_first_name || '''s Workspace', 'My Workspace'), new.id)
    RETURNING id INTO v_org_id;
  END IF;

  IF v_intended_product IS NOT NULL AND v_intended_product != '' THEN
    INSERT INTO public.product_access (user_id, org_id, product, role)
    VALUES (new.id, v_org_id, v_intended_product, 'admin')
    ON CONFLICT (user_id, org_id, product) DO NOTHING;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', new.email, SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

### Backfill existing workforce users

```sql
INSERT INTO public.users (id, email)
SELECT a.id, a.email FROM auth.users a
LEFT JOIN public.users u ON a.id = u.id WHERE u.id IS NULL
ON CONFLICT (id) DO NOTHING;
```

---

## 2. Swap accounts.dooza.ai env vars to workforce's Supabase project

Update accounts.dooza.ai environment variables (`.env.local` or hosting dashboard) to point at workforce's Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://cydhvvqvgrvntzitrrwy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<workforce project's anon key>
SUPABASE_SERVICE_ROLE_KEY=<workforce project's service role key>
```

Do this **after** the SQL from step 1 has been applied, so the trigger and tables exist when accounts starts using this project.

---

## 3. Ensure signup redirect for `product=workforce` is active

The auth callback at `app/auth/callback/route.ts` already handles `?next_product=workforce` and redirects with tokens in the URL hash. No changes needed there.

For the **signup form** (`app/(auth)/signup/signup-form.tsx`):

- When a user signs up with `?product=workforce`, after successful signup the app should redirect to `https://workforce.dooza.ai#access_token=...&refresh_token=...`
- Check if this auto-redirect is commented out or conditional — ensure it fires for `product=workforce`

For the **signin form/flow**:

- When `?product=workforce` is in the URL, after successful sign-in the callback should redirect to `https://workforce.dooza.ai#access_token=...&refresh_token=...`
- The pattern is: `https://{product}.dooza.ai#access_token={access_token}&refresh_token={refresh_token}`

---

## How workforce receives the tokens

1. User lands on `https://workforce.dooza.ai#access_token=...&refresh_token=...`
2. `App.tsx` parses the hash fragment
3. Calls `POST /api/auth/exchange` with `{ accessToken, refreshToken }`
4. Server verifies token via `supabaseAdmin.auth.getUser(accessToken)`
5. Finds existing profile or auto-provisions tenant + profile for first-time users
6. Returns `{ user, tenant, session }` — frontend stores in Zustand, navigates to `/employees`

---

## What does NOT need to change on accounts

- `app/auth/callback/route.ts` — already works
- Any shared Supabase auth logic — same SDK, just different project credentials
- The general redirect pattern — already supports `?product=` param
