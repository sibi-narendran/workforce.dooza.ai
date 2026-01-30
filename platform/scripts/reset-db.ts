import postgres from 'postgres';


const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

const sql = postgres(connectionString);

async function main() {
    console.log('Dropping schema public...');
    await sql`DROP SCHEMA IF EXISTS public CASCADE`;
    console.log('Dropping schema drizzle...');
    await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    console.log('Creating schema public...');
    await sql`CREATE SCHEMA public`;
    console.log('Granting permissions...');
    await sql`GRANT ALL ON SCHEMA public TO postgres`;
    await sql`GRANT ALL ON SCHEMA public TO public`;
    console.log('Database reset complete.');
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
