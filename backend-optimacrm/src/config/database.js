import 'dotenv/config';
import pg from 'pg';

// Return DATE columns as raw YYYY-MM-DD strings to avoid timezone shift issues
pg.types.setTypeParser(1082, (val) => val);

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/optimacrm',
});

export const query = (text, params) => pool.query(text, params);
