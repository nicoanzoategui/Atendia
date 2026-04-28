import { apiClient } from '../api/client';
import { getPendingAttendance, markAsSynced, removeSyncedAttendance } from '../db/pending-attendance-store';
import {
  getAllPendingSheetProcessed,
  removePendingSheetProcessed,
} from '../db/pending-sheet-list-store';
import { initDB } from '../db/indexed-db';
import { saveSessionCache, type CachedStudent } from '../db/session-cache-store';

// 20 tokens cubre ~200 min de clase con rotación cada 10 min
const TOKEN_POOL_SIZE = 20;

export const SyncManager = {
  async preCacheSession(sessionId: string) {
    try {
      const [session, students, tokenPool] = await Promise.all([
        apiClient(`/sessions/${sessionId}`),
        apiClient(`/sessions/${sessionId}/students`),
        apiClient(`/qr-tokens/session/${sessionId}?count=${TOKEN_POOL_SIZE}`, { method: 'POST' }),
      ]);

      const db = await initDB();

      // Guardar sesión
      await db.put('cached_sessions', session);

      // Guardar lista de alumnos
      const sRaw = students as unknown[] | { students?: unknown[] } | null | undefined;
      const studentsArr = Array.isArray(sRaw) ? sRaw : (sRaw && 'students' in sRaw ? sRaw.students ?? [] : []);
      for (const student of studentsArr) {
        await db.put('cached_students', student);
      }

      // Guardar pool de tokens QR
      const tokens = Array.isArray(tokenPool) ? tokenPool : [tokenPool];
      await saveSessionCache({
        session_id: sessionId,
        tokens: tokens.map((t: { token: string; expiresAt: number }) => ({
          token: t.token,
          expires_at: t.expiresAt,
          used: false,
        })),
        students: studentsArr as CachedStudent[],
        cached_at: Date.now(),
      });

      console.log(`[SyncManager] Sesión ${sessionId} pre-cacheada: ${tokens.length} tokens, ${studentsArr.length} alumnos`);
    } catch (e) {
      console.error('[SyncManager] Pre-cache falló:', e);
    }
  },

  async syncPending() {
    const pending = await getPendingAttendance();
    const toSync = pending.filter((p) => !p.synced);

    if (toSync.length === 0) return;

    console.log(`[SyncManager] Sincronizando ${toSync.length} registros...`);

    const qrRecords = toSync.filter((p) => p.source !== 'manual');
    const manualRecords = toSync.filter((p) => p.source === 'manual');

    try {
      if (qrRecords.length > 0) {
        const results = (await apiClient('/attendance/sync', {
          method: 'POST',
          body: JSON.stringify({ records: qrRecords }),
        })) as { offline_id: string; status: string }[];

        for (const res of results) {
          if (res.status === 'synced' || res.status === 'already_synced') {
            await markAsSynced(res.offline_id);
          }
        }
      }

      for (const rec of manualRecords) {
        try {
          const rawId = rec.student_id;
          const isUuid =
            typeof rawId === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId);
          await apiClient('/attendance/manual', {
            method: 'POST',
            body: JSON.stringify({
              sessionId: rec.class_session_id,
              status: rec.manual_status ?? 'present',
              method: rec.manual_method === 'ocr_upload' ? 'ocr_upload' : 'manual_teacher',
              ...(isUuid ? { studentId: rawId } : { studentExternalId: rawId }),
            }),
          });
          await markAsSynced(rec.offline_id);
        } catch (e) {
          console.error('[SyncManager] Manual sync failed:', rec.offline_id, e);
        }
      }

      const sheetRows = await getAllPendingSheetProcessed();
      for (const row of sheetRows) {
        try {
          await apiClient('/attendance/sheet-processed', {
            method: 'POST',
            body: JSON.stringify({
              sessionId: row.class_session_id,
              listId: row.list_id,
            }),
          });
          await removePendingSheetProcessed(row.offline_id);
        } catch (e) {
          console.error('[SyncManager] sheet-processed falló:', row.offline_id, e);
          const m = e instanceof Error ? e.message.toLowerCase() : '';
          if (m.includes('ya') || m.includes('already') || m.includes('duplicate') || m.includes('conflict')) {
            await removePendingSheetProcessed(row.offline_id).catch(() => {});
          }
        }
      }

      await removeSyncedAttendance();
      console.log('[SyncManager] Sincronización completada');
    } catch (e) {
      console.error('[SyncManager] Sincronización falló:', e);
    }
  },
};
