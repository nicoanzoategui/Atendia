import { Controller, Get, UseGuards, Request, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class HistoryController {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * GET /attendance/my-history
   * Devuelve los registros del alumno agrupados por materia,
   * con porcentaje de asistencia calculado.
   */
  @Get('my-history')
  @Roles('student')
  @UseGuards(RolesGuard)
  async getMyHistory(@Request() req) {
    const studentId = req.user.userId;
    const studentExternalId = req.user.external_id;
    const db = this.supabaseService.getClient();

    const { data: records, error } = await db
      .from('attendance_record')
      .select(`
        id, status, method, device_timestamp, sync_status,
        class_session (
          id, date, start_time, end_time, classroom, name, subject, external_id
        )
      `)
      .or(`student_id.eq.${studentId},student_external_id.eq.${studentExternalId || '__none__'}`)
      .order('device_timestamp', { ascending: false });

    if (error || !records) return { records: [], summary: [] };

    // Calcular % por materia
    const byProposal: Record<string, { name: string; total: number; present: number; late: number }> = {};
    for (const r of records) {
      const session = r.class_session as any;
      if (!session) continue;
      const pid = session.external_id || session.id;
      const displayName = session.subject || session.name || 'Clase';
      if (!byProposal[pid]) byProposal[pid] = { name: displayName, total: 0, present: 0, late: 0 };
      byProposal[pid].total++;
      if (r.status === 'present') byProposal[pid].present++;
      if (r.status === 'late') byProposal[pid].late++;
    }

    const summary = Object.entries(byProposal).map(([id, v]) => ({
      proposal_id: id,
      name: v.name,
      total: v.total,
      present: v.present,
      late: v.late,
      // Presente+tarde/total = asistencia efectiva (tarde cuenta como medio punto)
      percentage: v.total === 0 ? 0 : Math.round(((v.present + v.late * 0.5) / v.total) * 100),
    }));

    return { records, summary };
  }

  /**
   * GET /attendance/session/:id/history
   * Vista del docente: todos los registros de una sesión con datos del alumno.
   */
  @Get('session/:id/history')
  @Roles('teacher')
  @UseGuards(RolesGuard)
  async getSessionHistory(@Param('id') sessionId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select(`*, app_user!student_id(email, external_id)`)
      .eq('class_session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) return [];
    return data;
  }
}
