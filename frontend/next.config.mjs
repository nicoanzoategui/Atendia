import path from "node:path";
import { fileURLToPath } from "node:url";
import withPWAInit from "@ducanh2912/next-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      // Supabase REST API (Realtime y lecturas directas)
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
        handler: "NetworkFirst",
        options: {
          cacheName: "supabase-api",
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24,
          },
        },
      },
      // Backend NestJS — sesiones y alumnos (lectura offline)
      {
        urlPattern: /\/sessions(\/.*)?$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "backend-sessions",
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24,
          },
        },
      },
      // Backend NestJS — escritura de asistencia (nunca cachear)
      {
        urlPattern: /\/attendance\/(qr|manual|sync)$/,
        handler: "NetworkOnly",
        options: {
          cacheName: "backend-attendance-write",
          backgroundSync: {
            name: "attendance-sync-queue",
            options: {
              maxRetentionTime: 60 * 24, // 24 horas en minutos
            },
          },
        },
      },
    ],
  },
});

export default withPWA({
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  webpack: (config, { dev }) => {
    if (!dev) {
      config.parallelism = 1;
    }
    return config;
  },
});
