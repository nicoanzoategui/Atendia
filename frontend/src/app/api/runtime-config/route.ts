import { NextResponse } from 'next/server';

/**
 * Convención PaaS (llms.txt): frontend en `{prefix}.{zone}`, API en `{prefix}-api.{zone}`.
 * Si en ECS no llegan API_URL / NEXT_PUBLIC_API_URL al proceso de Node, sin esto el
 * cliente cae en localhost y el login falla con "failed to fetch".
 */
function inferPublicApiUrlFromHost(host: string): string | null {
  const h = host.trim().toLowerCase();
  if (!h || h.startsWith('localhost') || h.startsWith('127.')) return null;
  const dot = h.indexOf('.');
  if (dot <= 0) return null;
  const first = host.slice(0, dot).trim();
  if (!first || first.endsWith('-api')) return null;
  const rest = host.slice(dot + 1).trim();
  if (!rest) return null;
  return `https://${first}-api.${rest}`;
}

function requestHost(request: Request): string {
  const xf = request.headers.get('x-forwarded-host');
  if (xf) return xf.split(',')[0].trim();
  return request.headers.get('host')?.trim() ?? '';
}

/** Expuesto al browser: URL del API (env de ECS; no depender de NEXT_PUBLIC inlinado en build). */
export function GET(request: Request) {
  const fromEnv =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';

  const host = requestHost(request);
  const inferred = inferPublicApiUrlFromHost(host);

  let apiUrl = fromEnv;
  if (inferred && (!apiUrl || /localhost|127\.0\.0\.1/.test(apiUrl))) {
    apiUrl = inferred;
  }
  if (!apiUrl) {
    apiUrl = 'http://localhost:3001';
  }

  return NextResponse.json(
    { apiUrl },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
