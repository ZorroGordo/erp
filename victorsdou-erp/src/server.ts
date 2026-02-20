import 'dotenv/config';
import { buildApp } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

async function start() {
  const app = await buildApp();

  try {
    // Verify DB connection
    await prisma.$connect();
    app.log.info('[Prisma] Database connected');

    // Verify Redis connection
    await redis.connect();

    // Start server
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(
      `🥐 VictorOS ERP running on http://${config.HOST}:${config.PORT}`,
    );

    if (config.NODE_ENV !== 'production') {
      app.log.info(
        `📖 Swagger UI: http://localhost:${config.PORT}/docs`,
      );
    }
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.info(`\nReceived ${signal} — shutting down gracefully...`);
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();
