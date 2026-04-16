import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QrService } from '../qr/qr.service';

@Injectable()
export class AttendanceService {
  constructor(
    private supabaseService: SupabaseService,
    private qrService: QrService
  ) {}

  private mapLegacyStatus(status: string) {
    return status === 'justified' ? 'excused' : status;
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

  async registerManual(studentId: string, sessionId: string, status: string, actorId: string) {
    const cleanStatus = typeof status === 'string' ? status.trim().toLowerCase() : status;
    const cleanSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
    
    const validStatuses = ['present', 'late', 'absent', 'justified'];
    if (!validStatuses.includes(cleanStatus)) {
      throw new BadRequestException(`Status inválido enviado por la web: "${cleanStatus}". Los permitidos en código son: present, late, absent, justified.`);
    }

    console.log(`[registerManual] Processing ${cleanStatus} for student ${studentId} in session ${cleanSessionId}`);
    
    const { data: session } = await this.supabaseService.getClient()
      .from('class_session')
      .select('tenant_id')
      .eq('id', cleanSessionId)
      .single();

    const { data: studentUser } = await this.supabaseService.getClient()
      .from('app_user')
      .select('id, external_id')
      .eq('id', studentId)
      .single();

    const { data, error } = await this.supabaseService.getClient()
      .from('attendance_record')
      .upsert({
        tenant_id: session?.tenant_id,
        class_session_id: cleanSessionId,
        student_id: studentId,
        student_external_id: studentUser?.external_id || null,
        status: this.mapLegacyStatus(cleanStatus),
        method: 'admin',
        recorded_by_actor_type: 'teacher',
        recorded_by_actor_id: actorId,
        device_timestamp: new Date().toISOString(),
        sync_status: 'synced',
        payload_jsonb: {
          source: 'manual_teacher',
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'class_session_id,student_id' })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    // Audit log
    await this.supabaseService.getClient()
      .from('audit_log')
      .insert({
        table_name: 'attendance_record',
        record_id: data.id,
        action: 'MANUAL_OVERRIDE',
        new_data: data,
        actor_id: actorId
      });

    return data;
  }
}
