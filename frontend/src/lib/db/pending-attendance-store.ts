import { initDB } from './indexed-db';

export interface PendingAttendance {
  offline_id: string;
  student_id: string;
  class_session_id: string;
  qr_token: string;
  scanned_at: string;
  synced: boolean;
  /** qr = alumno escaneó; manual = docente marcó sin red */
  source?: 'qr' | 'manual';
  manual_status?: 'present' | 'late' | 'absent' | 'justified';
}

export async function savePendingAttendance(record: Omit<PendingAttendance, 'synced'>) {
  const db = await initDB();
  await db.put('pending_attendance', { ...record, synced: false });
}

export async function getPendingAttendance(): Promise<PendingAttendance[]> {
  const db = await initDB();
  return db.getAll('pending_attendance');
}

export async function markAsSynced(offline_id: string) {
  const db = await initDB();
  const record = await db.get('pending_attendance', offline_id);
  if (record) {
    await db.put('pending_attendance', { ...record, synced: true });
  }
}

export async function removeSyncedAttendance() {
  const db = await initDB();
  const tx = db.transaction('pending_attendance', 'readwrite');
  const store = tx.objectStore('pending_attendance');
  const records = await store.getAll();
  for (const record of records) {
    if (record.synced) {
      await store.delete(record.offline_id);
    }
  }
  await tx.done;
}
