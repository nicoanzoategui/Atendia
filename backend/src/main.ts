import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env relative to this file so it works regardless of CWD
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function validateEnv() {
  const required = ['JWT_SECRET', 'QR_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5000,http://localhost:5002')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 4001);
  await app.listen(port, '0.0.0.0');
}
bootstrap();
