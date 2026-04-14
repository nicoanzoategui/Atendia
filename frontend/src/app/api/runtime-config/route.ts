import { NextResponse } from 'next/server';

/** Expuesto al browser: URL del API (env de ECS; no depender de NEXT_PUBLIC inlinado en build). */
export function GET() {
  const apiUrl =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:3001';
  return NextResponse.json(
    { apiUrl },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
