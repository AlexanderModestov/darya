import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Unexpected pool error', err);
  process.exit(1);
});

export const query = (text, params) => pool.query(text, params);
export default pool;
