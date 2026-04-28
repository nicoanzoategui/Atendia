import { initDB } from './indexed-db';

export type PendingSheetList = {
  offline_id: string;
  class_session_id: string;
  list_id: string;
};

/** Registro diferido de POST /attendance/sheet-processed (ID de lista PDF). */
export async function enqueuePendingSheetProcessed(
  entry: PendingSheetList,
): Promise<void> {
  const db = await initDB();
  await db.put('pending_sheet_list', entry);
}

export async function getAllPendingSheetProcessed(): Promise<PendingSheetList[]> {
  const db = await initDB();
  if (!db.objectStoreNames.contains('pending_sheet_list')) return [];
  return db.getAll('pending_sheet_list');
}

export async function removePendingSheetProcessed(offline_id: string): Promise<void> {
  const db = await initDB();
  if (!db.objectStoreNames.contains('pending_sheet_list')) return;
  await db.delete('pending_sheet_list', offline_id);
}
