import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseServiceKey || !databaseUrl) {
    console.error('Error: SUPABASE_URL, SUPABASE_SERVICE_KEY, and DATABASE_URL are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const sql = postgres(databaseUrl);

async function main() {
    const email = 'sibinarendran@gmail.com';
    const password = 'sibi5161';
    let userId: string;

    console.log(`Checking user: ${email}...`);

    // Try to create user
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (createError) {
        // If user already exists, try to list users to find the ID (admin.getUserByEmail is not always available in all versions, using listUsers to be safe or assuming we can fetch)
        // Actually simpler: if error is "Email already registered", we can't easily get ID without listing or using secret method.
        // Let's try listing users by email if create fails.
        console.log('User creation returned error:', createError);
        // Check code or message
        if (createError.code === 'email_exists' || createError.message.includes('already registered') || createError.message.includes('email already exists')) {
            console.log('User exists, fetching ID...');

            // Try SQL first
            const users = await sql`SELECT id FROM auth.users WHERE email = ${email}`;
            if (users.length > 0) {
                userId = users[0].id;
            } else {
                console.error('Could not find existing user ID via SQL. Trying listUsers...');
                // Fallback
                const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
                if (listError) throw listError;
                const found = listData.users.find(u => u.email === email);
                if (!found) throw new Error('User supposedly exists but not found in list.');
                userId = found.id;
            }
        } else {
            throw createError;
        }
    } else {
        console.log('User created successfully.');
        userId = createData.user.id;
    }

    console.log(`User ID: ${userId}`);

    // Create Tenant
    console.log('Checking tenant...');
    const existingTenants = await sql`SELECT * FROM public.tenants WHERE owner_id = ${userId}`;
    let tenantId;

    if (existingTenants.length === 0) {
        console.log('Creating tenant...');
        const result = await sql`
        INSERT INTO public.tenants (name, slug, owner_id)
        VALUES ('My Workspace', ${userId}, ${userId})
        RETURNING id
      `;
        tenantId = result[0].id;
        console.log('Tenant created:', tenantId);
    } else {
        console.log('Tenant already exists:', existingTenants[0].id);
        tenantId = existingTenants[0].id;
    }

    // Create Profile
    console.log('Checking profile...');
    const existingProfiles = await sql`SELECT * FROM public.profiles WHERE id = ${userId}`;

    if (existingProfiles.length === 0) {
        console.log('Creating profile...');
        await sql`
        INSERT INTO public.profiles (id, tenant_id, role, display_name)
        VALUES (${userId}, ${tenantId}, 'owner', 'Sibi Narendran')
      `;
        console.log('Profile created.');
    } else {
        console.log('Profile already exists.');
    }

    console.log('Done.');
    process.exit(0);
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
