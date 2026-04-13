#!/usr/bin/env node
/**
 * Atendee — Migration Runner
 * Usa la Supabase Management API (api.supabase.com) para ejecutar DDL SQL.
 * Requiere un Personal Access Token (PAT) — diferente a las keys del proyecto.
 *
 * Cómo obtener el PAT:
 *   supabase.com/dashboard → Avatar → Account → Access Tokens → Generate new token
 *
 * Uso:
 *   SUPABASE_PAT=sbp_xxx node scripts/migrate.js           # solo migraciones
 *   SUPABASE_PAT=sbp_xxx node scripts/migrate.js --seed    # migraciones + seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'mamgrxviddqdqehaznqq';
const PAT         = process.env.SUPABASE_PAT;

if (!PAT) {
  console.error('\n❌  SUPABASE_PAT no definido.');
  console.error('   Obtenélo en: supabase.com/dashboard → Avatar → Account → Access Tokens');
  console.error('   Luego: SUPABASE_PAT=sbp_xxx node scripts/migrate.js --seed\n');
  process.exit(1);
}

const API_URL  = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const RUN_SEED = process.argv.includes('--seed');

async function execSQL(sql, label) {
  const res = await fetch(API_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.text();

  if (!res.ok) {
    // Ignorar errores de "ya existe" — script idempotente
    if (body.includes('already exists') || body.includes('duplicate key')) {
      console.log(`  ⚠️   ${label} — ya existía, ok`);
      return;
    }
    console.error(`  ❌  ${label} (HTTP ${res.status}): ${body.slice(0, 200)}`);
    throw new Error(`Migration falló: ${label}`);
  }

  console.log(`  ✅  ${label}`);
}

async function runDir(dir, emoji, label) {
  console.log(`\n${emoji}  ${label}`);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    if (sql) await execSQL(sql, file);
  }
}

async function main() {
  console.log(`\n🔌  Conectando a proyecto Supabase: ${PROJECT_REF}`);

  const ping = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'SELECT 1 AS ping' }),
  });

  if (!ping.ok) {
    const b = await ping.text();
    if (ping.status === 401) {
      console.error('\n❌  Token inválido (401). Asegurate de usar un Personal Access Token (PAT),');
      console.error('   NO las keys del proyecto. Crealo en: supabase.com → Account → Access Tokens\n');
    } else {
      console.error(`\n❌  No se pudo conectar: HTTP ${ping.status} ${b}\n`);
    }
    process.exit(1);
  }

  console.log('✅  Conexión OK\n');

  const MIGRATIONS_DIR = path.join(__dirname, '../supabase/migrations');
  const SEED_DIR       = path.join(__dirname, '../supabase/seed');

  await runDir(MIGRATIONS_DIR, '📦', 'Ejecutando migraciones...');
  if (RUN_SEED) await runDir(SEED_DIR, '🌱', 'Cargando seed data...');

  console.log('\n🎉  ¡Listo! Base de datos lista.\n');
}

main().catch(err => {
  console.error('\n💥', err.message);
  process.exit(1);
});
