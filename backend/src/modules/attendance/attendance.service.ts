import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QrService } from '../qr/qr.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normId(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

export type ManualRegisterBody = {
  sessionId: string;
  status: string;
  studentId?: string;
  studentExternalId?: string;
  method?: 'manual_teacher' | 'ocr_upload' | 'admin';
};

@Injectable()
export class AttendanceService {
  constructor(
    private supabaseService: SupabaseService,
    private qrService: QrService
  ) {}

  private mapLegacyStatus(status: string) {
    return status === 'justified' ? 'excused' : status;
  }

  /**
   * Resuelve estudiante desde UUID o desde ID externo de la fila en class_session_student.
   */
  private async resolveManualStudentId(
    sessionId: string,
    studentIdRaw?: string,
    studentExternalIdRaw?: string
  ): Promise<{ student_uuid: string; external_id: string | null }> {
    const client = this.supabaseService.getClient();
    const sid = typeof sessionId === 'string' ? sessionId.trim() : '';

    const { data: roster, error } = await client
      .from('class_session_student')
      .select('student_id, student_external_id')
      .eq('class_session_id', sid);

    if (error) throw new BadRequestException(error.message);

    const studentIdTrim = typeof studentIdRaw === 'string' ? studentIdRaw.trim() : '';
    const extTrim =
      typeof studentExternalIdRaw === 'string'
        ? studentExternalIdRaw.trim()
        : '';

    let row =
      studentIdTrim && UUID_RE.test(studentIdTrim)
        ? roster?.find((r) => r.student_id && String(r.student_id) === studentIdTrim)
        : undefined;

    // Compat: sync offline puede mandar legajo en studentId en lugar del UUID.
    if (!row && studentIdTrim !== '' && !UUID_RE.test(studentIdTrim)) {
      const ne = normId(studentIdTrim);
      row = roster?.find((r) => normId(String(r.student_external_id ?? '')) === ne);
    }

    if (!row && extTrim !== '') {
      const ne = normId(extTrim);
      row = roster?.find((r) => normId(String(r.student_external_id ?? '')) === ne);
    }

    if (!row) {
      throw new BadRequestException('El alumno no figura en la comisión de esta clase');
    }

    let uuid = row.student_id != null ? String(row.student_id).trim() : '';
    let external =
      row.student_external_id != null ? String(row.student_external_id).trim() : null;

    if (!uuid && extTrim !== '') {
      const { data: sess } = await client
        .from('class_session')
        .select('tenant_id')
        .eq('id', sid)
        .single();
      const tid = sess?.tenant_id as string | undefined;
      const { data: userRow } = await client
        .from('app_user')
        .select('id')
        .eq('role', 'student')
        .eq('tenant_id', tid!)
        .eq('external_id', extTrim)
        .maybeSingle();

      if (userRow?.id) {
        uuid = String(userRow.id);
      }
      if (!external) external = extTrim;
    }

    if (!uuid || !UUID_RE.test(uuid)) {
      throw new BadRequestException(
        'El alumno no tiene vínculo con usuario activo en el sistema para esta clase'
      );
    }

    return { student_uuid: uuid, external_id: external ?? null };
  }

  /** Devuelve 409 si la lista PDF ya fue registrada como procesada para la sesión. */
  async assertListIdUnused(classSessionId: string, listId: string) {
    const lid = listId.trim();
    if (!UUID_RE.test(lid)) {
      throw new BadRequestException('listId debe ser un UUID (copiado del PDF)');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('attendance_sheet_processed')
      .select('id')
      .eq('class_session_id', classSessionId)
      .eq('list_id', lid)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (data) {
      throw new ConflictException('Esta lista ya fue procesada para esta clase');
    }
  }

  async markSheetProcessed(sessionIdParam: string, listIdRaw: string, actorId: string) {
    const sessionId = sessionIdParam.trim();
    const listId = listIdRaw.trim();

    if (!UUID_RE.test(listId)) {
      throw new BadRequestException('listId debe ser un UUID');
    }

    const client = this.supabaseService.getClient();
    const { data: sess, error } = await client
      .from('class_session')
      .select('id, tenant_id')
      .eq('id', sessionId)
      .single();

    if (error || !sess) throw new BadRequestException('Sesión no encontrada');

    const tenantId = String(sess.tenant_id);

    const { error: insErr } = await client.from('attendance_sheet_processed').insert({
      tenant_id: tenantId,
      class_session_id: sessionId,
      list_id: listId,
      recorded_by_actor_id: actorId,
    });

    if (insErr) {
      if (String(insErr.message).includes('duplicate') || insErr.code === '23505') {
        throw new ConflictException('Esta lista ya fue registrada para esta clase');
      }
      throw new BadRequestException(insErr.message);
    }

    return { ok: true, sessionId, listId };
  }

  async registerByQr(studentId: string, token: string, offlineId?: string) {
    const qrData = this.qrService.validateToken(token);
    
    // Check if student is enrolled in this session
    const { data: studentUser, error: userErr } = await this.supabaseService.getClient()
      .from('app_user')
      .select('id, external_id')
      .eq('id', studentId)
      .single();

    if (userErr || !studentUser) {
      throw new BadRequestException('Usuario no encontrado');
    }

    // Roster rows from integración suelen tener solo student_external_id (student_id NULL).
    // Comparar en memoria evita filtros .or() frágiles y permite trim / mayúsculas.
    const { data: rosterRows, error: rosterErr } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select('*')
      .eq('class_session_id', qrData.class_id);

    if (rosterErr) {
      throw new BadRequestException(rosterErr.message);
    }

    const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
    const userExt = norm(studentUser.external_id);

    const enrollment = (rosterRows ?? []).find((r) => {
      if (r.student_id != null && String(r.student_id) === String(studentId)) return true;
      if (userExt !== '' && norm(r.student_external_id) === userExt) return true;
      return false;
    });

    if (!enrollment) {
      throw new BadRequestException('No estás inscrito en esta sesión');
    }

    const { data: session, error: sessionErr } = await this.supabaseService.getClient()
      .from('class_session')
      .select('*')
      .eq('id', qrData.class_id)
      .single();

    if (sessionErr || !session) {
      throw new BadRequestException('Sesión no encontrada');
    }

    const sessionStatus = String(session.status ?? '').toLowerCase();
    if (sessionStatus !== 'attendance_open') {
      if (sessionStatus === 'scheduled') {
        throw new BadRequestException(
          'El docente aún no abrió la asistencia para esta clase. Pedile que inicie el código QR.',
        );
      }
      if (sessionStatus === 'attendance_closed' || sessionStatus === 'finalized') {
        throw new BadRequestException('La toma de asistencia de esta clase ya está cerrada.');
      }
      if (sessionStatus === 'cancelled') {
        throw new BadRequestException('Esta clase fue cancelada.');
      }
      throw new BadRequestException('No se puede registrar asistencia con QR en este estado de la clase.');
    }

    /** Por requisito de producto: escaneo QR = presente (sin “tarde” automática). */
    const status = 'present';

    const { data, error } = await this.supabaseService.getClient()
      .from('attendance_record')
      .upsert({
        tenant_id: session.tenant_id,
        class_session_id: qrData.class_id,
        student_id: studentId,
        student_external_id: studentUser?.external_id || enrollment?.student_external_id || null,
        status: status,
        method: 'qr',
        recorded_by_actor_type: 'student',
        recorded_by_actor_id: studentId,
        device_timestamp: new Date().toISOString(),
        sync_status: 'synced',
        offline_id: offlineId,
        payload_jsonb: {
          qr_token_used: true,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'class_session_id,student_id' })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async registerManual(body: ManualRegisterBody, actorId: string) {
    const cleanStatus = typeof body.status === 'string' ? body.status.trim().toLowerCase() : body.status;
    const cleanSessionId = Array.isArray(body.sessionId) ? body.sessionId[0] : body.sessionId;

    const validStatuses = ['present', 'late', 'absent', 'justified'];
    if (!validStatuses.includes(cleanStatus)) {
      throw new BadRequestException(
        `Status inválido: "${cleanStatus}". Permitidos: present, late, absent, justified.`
      );
    }

    const resolved = await this.resolveManualStudentId(
      cleanSessionId,
      body.studentId,
      body.studentExternalId
    );

    const methodRaw = body.method ?? 'manual_teacher';
    const method =
      methodRaw === 'ocr_upload' ? 'ocr_upload' : methodRaw === 'admin' ? 'admin' : 'manual_teacher';

    const { data: session } = await this.supabaseService.getClient()
      .from('class_session')
      .select('tenant_id')
      .eq('id', cleanSessionId)
      .single();

    const { data: studentUser } = await this.supabaseService.getClient()
      .from('app_user')
      .select('id, external_id')
      .eq('id', resolved.student_uuid)
      .single();

    const { data, error } = await this.supabaseService.getClient()
      .from('attendance_record')
      .upsert(
        {
          tenant_id: session?.tenant_id,
          class_session_id: cleanSessionId,
          student_id: resolved.student_uuid,
          student_external_id: studentUser?.external_id ?? resolved.external_id,
          status: this.mapLegacyStatus(cleanStatus),
          method,
          recorded_by_actor_type: 'teacher',
          recorded_by_actor_id: actorId,
          device_timestamp: new Date().toISOString(),
          sync_status: 'synced',
          payload_jsonb: {
            source: method === 'ocr_upload' ? 'ocr_upload' : 'manual_teacher',
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'class_session_id,student_id' }
      )
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.supabaseService.getClient().from('audit_log').insert({
      table_name: 'attendance_record',
      record_id: data.id,
      action: 'MANUAL_OVERRIDE',
      new_data: data,
      actor_id: actorId,
    });

    return data;
  }
}
