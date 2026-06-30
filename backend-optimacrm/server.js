import 'dotenv/config';
import app from './src/app.js';
import { pool } from './src/config/database.js';
import { runMigrations } from './src/database/migrate.js';
import { startExpirationJob } from './src/jobs/devisExpirationJob.js';
import { startEmailPollingJob } from './src/modules/tickets/jobs/emailPollingJob.js';

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await pool.query('SELECT NOW()');
    console.log('✓ Database connected');

    await runMigrations();
    console.log('✓ Migrations completed');

    startExpirationJob();
    startEmailPollingJob();

    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Swagger docs at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
