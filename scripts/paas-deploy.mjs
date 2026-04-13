#!/usr/bin/env node
/**
 * PaaS deploy: upload zip source → preview → deploy → poll status.
 * Requires: PAAS_TOKEN (with or without "paas_" prefix)
 * Optional: PAAS_API_BASE (default https://api.new-feats.redtecnologica.org)
 * Optional: PAAS_PROJECT_ID, PAAS_DOMAIN_PREFIX, PAAS_ZONE
 * Optional: PAAS_REBUILD_SERVICE — e.g. "backend" → POST .../services/backend/rebuild (upload + rebuild only)
 * Optional: PAAS_REDEPLOY=1 — POST /deploy/{project_id}/redeploy (upload + full image rebuild, keeps service env/ports)
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const API_BASE =
  process.env.PAAS_API_BASE?.replace(/\/$/, "") ||
  "https://api.new-feats.redtecnologica.org";
const PROJECT_ID = process.env.PAAS_PROJECT_ID || "atendee-paas";
const DOMAIN_PREFIX = process.env.PAAS_DOMAIN_PREFIX || PROJECT_ID;
const ZONE = process.env.PAAS_ZONE || "new-feats.redtecnologica.org";

let token = process.env.PAAS_TOKEN || "";
if (!token) {
  console.error("Missing PAAS_TOKEN");
  process.exit(1);
}
if (!token.startsWith("paas_")) {
  token = `paas_${token}`;
}

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  ".cursor",
]);

const SKIP_FILE = /^(\.env|\.env\.)/;

function* walkFiles(dir, base = dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      if (SKIP_DIR.has(name.name)) continue;
      yield* walkFiles(full, base);
    } else {
      if (SKIP_FILE.test(name.name)) continue;
      yield full;
    }
  }
}

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

async function collectMultipartParts() {
  const parts = [];
  for (const abs of walkFiles(ROOT)) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    if (rel.startsWith("..")) continue;
    parts.push({ rel, abs });
  }
  return parts;
}

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function uploadFiles() {
  const files = await collectMultipartParts();
  const boundary = `----formboundary${Date.now()}`;
  const chunks = [];

  const push = (s) => chunks.push(Buffer.from(s, "utf8"));

  for (const { rel, abs } of files) {
    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="files"; filename="${rel.replace(/"/g, '\\"')}"\r\n`,
    );
    push(`Content-Type: application/octet-stream\r\n\r\n`);
    chunks.push(readFileSync(abs));
    push(`\r\n`);
  }
  push(`--${boundary}--\r\n`);

  const body = Buffer.concat(chunks);
  const res = await fetch(`${API_BASE}/deploy/upload-files`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upload-files ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

function buildDeployBody(s3Key) {
  const frontendUrl = `https://${DOMAIN_PREFIX}.${ZONE}`;
  const backendPublicUrl = `https://${DOMAIN_PREFIX}-api.${ZONE}`;
  const envBackend = parseEnvFile(join(ROOT, "backend", ".env"));

  const backendEnv = {
    NODE_ENV: "production",
    PORT: "4001",
    CORS_ORIGIN: frontendUrl,
    JWT_SECRET: envBackend.JWT_SECRET,
    JWT_EXPIRES_IN: envBackend.JWT_EXPIRES_IN || "30d",
    QR_SECRET: envBackend.QR_SECRET,
    QR_TOKEN_TTL_MINUTES: envBackend.QR_TOKEN_TTL_MINUTES || "10",
    SUPABASE_URL: envBackend.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: envBackend.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: envBackend.SUPABASE_SECRET_KEY,
    SUPABASE_ANON_KEY: envBackend.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: envBackend.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_PROJECT_REF: envBackend.SUPABASE_PROJECT_REF,
  };

  Object.keys(backendEnv).forEach((k) => {
    if (backendEnv[k] === undefined || backendEnv[k] === "") {
      delete backendEnv[k];
    }
  });

  const frontendEnv = {
    NODE_ENV: "production",
    NEXT_PUBLIC_API_URL: backendPublicUrl,
    NEXT_PUBLIC_SUPABASE_URL: envBackend.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: envBackend.SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: envBackend.SUPABASE_ANON_KEY,
  };
  Object.keys(frontendEnv).forEach((k) => {
    if (frontendEnv[k] === undefined || frontendEnv[k] === "") {
      delete frontendEnv[k];
    }
  });

  return {
    project_id: PROJECT_ID,
    domain_prefix: DOMAIN_PREFIX,
    source: { type: "zip", s3_key: s3Key },
    services: {
      frontend: {
        build_context: ".",
        dockerfile_path: "frontend/Dockerfile",
        port: 3000,
        memory: 1024,
        env: frontendEnv,
      },
      backend: {
        build_context: ".",
        dockerfile_path: "backend/Dockerfile",
        port: 4001,
        memory: 1024,
        env: backendEnv,
      },
    },
  };
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  console.log("Uploading sources…");
  const { s3_key, file_count, size_bytes } = await uploadFiles();
  console.log(`Uploaded s3_key=${s3_key} files=${file_count} size=${size_bytes}`);

  if (process.env.PAAS_REDEPLOY === "1") {
    console.log("Redeploy (rebuild all images from zip, keep service config)…");
    const deploy = await postJson(`/deploy/${PROJECT_ID}/redeploy`, {
      source: { type: "zip", s3_key },
    });
    const jobId = deploy.job_id;
    if (!jobId) {
      console.error("No job_id:", deploy);
      process.exit(1);
    }
    console.log(`job_id=${jobId} poll every 15s…`);
    for (;;) {
      await new Promise((r) => setTimeout(r, 15000));
      const st = await getJson(`/deploy/${jobId}/status`);
      console.log(
        `${st.status} ${st.progress_percent ?? "?"}% — ${st.step || ""}`,
      );
      if (st.status === "ready") {
        console.log("URLs:", JSON.stringify(st.urls, null, 2));
        return;
      }
      if (st.status === "failed") {
        console.error("FAILED:", st.error || st);
        if (st.service_statuses) {
          console.error("service_statuses:", st.service_statuses);
        }
        process.exit(1);
      }
    }
  }

  const rebuildService = process.env.PAAS_REBUILD_SERVICE?.trim();
  if (rebuildService) {
    console.log(`Rebuilding service "${rebuildService}" only…`);
    const deploy = await postJson(
      `/deploy/${PROJECT_ID}/services/${rebuildService}/rebuild`,
      { source: { type: "zip", s3_key } },
    );
    const jobId = deploy.job_id;
    if (!jobId) {
      console.error("No job_id:", deploy);
      process.exit(1);
    }
    console.log(`job_id=${jobId} poll every 15s…`);
    for (;;) {
      await new Promise((r) => setTimeout(r, 15000));
      const st = await getJson(`/deploy/${jobId}/status`);
      console.log(
        `${st.status} ${st.progress_percent ?? "?"}% — ${st.step || ""}`,
      );
      if (st.status === "ready") {
        console.log("URLs:", JSON.stringify(st.urls, null, 2));
        return;
      }
      if (st.status === "failed") {
        console.error("FAILED:", st.error || st);
        if (st.service_statuses) {
          console.error("service_statuses:", st.service_statuses);
        }
        process.exit(1);
      }
    }
  }

  const body = buildDeployBody(s3_key);
  console.log("Preview…");
  const preview = await postJson("/deploy/preview", body);
  console.log("project_id:", preview.project_id);
  if (preview.services_summary) {
    console.log("services_summary:", JSON.stringify(preview.services_summary, null, 2));
  }

  console.log("Starting deploy…");
  const deploy = await postJson("/deploy", body);
  const jobId = deploy.job_id;
  if (!jobId) {
    console.error("No job_id:", deploy);
    process.exit(1);
  }
  console.log(`job_id=${jobId} poll every 15s…`);

  for (;;) {
    await new Promise((r) => setTimeout(r, 15000));
    const st = await getJson(`/deploy/${jobId}/status`);
    console.log(
      `${st.status} ${st.progress_percent ?? "?"}% — ${st.step || ""}`,
    );
    if (st.status === "ready") {
      console.log("URLs:", JSON.stringify(st.urls, null, 2));
      return;
    }
    if (st.status === "failed") {
      console.error("FAILED:", st.error || st);
      if (st.service_statuses) {
        console.error("service_statuses:", st.service_statuses);
      }
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
