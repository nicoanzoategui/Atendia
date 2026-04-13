import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SupabaseService } from '../supabase/supabase.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'admin_tenant', 'admin_app')
@Controller('admin')
export class AdminController {
  constructor(private readonly supabaseService: SupabaseService) {}

  private normalizeSessionStatus(status?: string) {
    const map: Record<string, string> = {
      draft: 'scheduled',
      open: 'attendance_open',
      closed: 'attendance_closed',
      synced: 'finalized',
      cancelled: 'cancelled',
      scheduled: 'scheduled',
      attendance_open: 'attendance_open',
      attendance_closed: 'attendance_closed',
      finalized: 'finalized',
    };

    return map[status || 'scheduled'] || 'scheduled';
  }

  private buildClassDisplayId(session: any) {
    if (session?.external_class_session_id) {
      return session.external_class_session_id;
    }

    if (session?.external_id) {
      return session.external_id;
    }

    const classroom = (session?.location_classroom || session?.classroom || 'AULA').toString().replace(/\s+/g, '').toUpperCase();
    const course = (
      session?.name ||
      session?.subject ||
      session?.learning_proposal?.name ||
      session?.learning_proposal_edition?.name ||
      session?.learning_proposal_edition_id ||
      'CURSO'
    )
      .toString()
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 10)
      .toUpperCase();
    const edition = (
      session?.learning_proposal_edition?.name ||
      session?.learning_proposal_edition_id ||
      'CURSADA'
    )
      .toString()
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 10)
      .toUpperCase();
    return `${classroom}-${course}-${edition}`;
  }

  @Get('courses')
  async courses(@Request() req) {
    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .select(`
        learning_proposal_edition_id,
        name,
        subject,
        learning_proposal (id, name)
      `)
      .eq('tenant_id', req.user.tenant_id)
      .order('date', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    const unique = new Map<string, any>();
    for (const session of (data ?? []) as any[]) {
      const key = session.learning_proposal_edition_id || session.subject || session.name;
      if (!unique.has(key)) {
        unique.set(key, {
          id: key,
          name: session.subject || session.name || (Array.isArray(session.learning_proposal) ? session.learning_proposal[0]?.name : session.learning_proposal?.name) || 'Curso',
        });
      }
    }
    return Array.from(unique.values());
  }

  @Get('courses/:editionId/classes')
  async courseClasses(@Param('editionId') editionId: string, @Request() req) {
    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .select(`
        id, date, start_time, classroom, location_campus, location_classroom, status, learning_proposal_edition_id,
        external_class_session_id, external_id, name, subject, recovery_for_session_id
      `)
      .eq('learning_proposal_edition_id', editionId)
      .eq('tenant_id', req.user.tenant_id)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((session: any) => ({
      ...session,
      status: this.normalizeSessionStatus(session.status),
      classroom: session.location_classroom || session.classroom,
      class_display_id: this.buildClassDisplayId(session),
    }));
  }

  @Get('classes/:classId')
  async classDetail(@Param('classId') classId: string, @Request() req) {
    const db = this.supabaseService.getClient();

    const { data: classSession, error: classErr } = await db
      .from('class_session')
      .select(`
        id, date, start_time, classroom, location_campus, location_classroom, status, recovery_for_session_id, tenant_id,
        external_class_session_id, external_id, name, subject
      `)
      .eq('id', classId)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (classErr || !classSession) {
      throw new BadRequestException('Clase no encontrada');
    }

    const { data: openLog } = await db
      .from('audit_log')
      .select(`
        id, created_at, actor_id,
        app_user:actor_id (email)
      `)
      .eq('tenant_id', req.user.tenant_id)
      .eq('action', 'OPEN_ATTENDANCE')
      .eq('record_id', classId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: students, error: studentsErr } = await db
      .from('class_session_student')
      .select(`
        student_id,
        student_external_id,
        student_name,
        app_user:student_id (id, email)
      `)
      .eq('class_session_id', classId);

    if (studentsErr) throw new BadRequestException(studentsErr.message);

    const { data: records } = await db
      .from('attendance_record')
      .select('id, student_id, student_external_id, status')
      .eq('class_session_id', classId);

    const byStudent = new Map((records ?? []).map((r: any) => [r.student_id || r.student_external_id, r]));
    const studentRows = (students ?? []).map((student: any) => {
      const record = byStudent.get(student.student_id || student.student_external_id);
      return {
        student_id: student.student_id,
        student_external_id: student.student_external_id,
        name: student.student_name || student.app_user?.email || '',
        email: student.app_user?.email || '',
        status: record?.status || 'absent',
      };
    });

    const teacherEmail = Array.isArray((openLog as any)?.app_user)
      ? (openLog as any)?.app_user?.[0]?.email
      : (openLog as any)?.app_user?.email;

    return {
      class_session: {
        ...classSession,
        status: this.normalizeSessionStatus(classSession.status),
        classroom: classSession.location_classroom || classSession.classroom,
        course_name: classSession.subject || classSession.name || 'Clase',
        class_display_id: this.buildClassDisplayId(classSession),
      },
      teacher: teacherEmail || 'Sin registro',
      students: studentRows,
    };
  }

  @Patch('classes/:classId/students/:studentId')
  async updateStudentAttendance(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body() body: { status: 'present' | 'late' | 'absent' | 'justified' },
    @Request() req
  ) {
    const valid = ['present', 'late', 'absent', 'justified'];
    if (!valid.includes(body.status)) {
      throw new BadRequestException('Estado invalido');
    }

    const { data: student } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select('student_external_id')
      .eq('class_session_id', classId)
      .eq('student_id', studentId)
      .maybeSingle();

    const { data: classSession } = await this.supabaseService.getClient()
      .from('class_session')
      .select('tenant_id')
      .eq('id', classId)
      .single();

    const { data, error } = await this.supabaseService.getClient()
      .from('attendance_record')
      .upsert({
        tenant_id: classSession?.tenant_id,
        class_session_id: classId,
        student_id: studentId,
        student_external_id: student?.student_external_id || null,
        status: body.status === 'justified' ? 'excused' : body.status,
        method: 'admin',
        recorded_by_actor_type: 'admin',
        recorded_by_actor_id: req.user.userId,
        device_timestamp: new Date().toISOString(),
        sync_status: 'synced',
        payload_jsonb: { source: 'admin_adjustment' },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'class_session_id,student_id' })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  @Get('classes/:classId/export')
  async exportClass(
    @Param('classId') classId: string,
    @Query('type') type: 'teacher' | 'students' = 'students',
    @Res() res: Response,
    @Request() req
  ) {
    const classData = await this.classDetail(classId, req);

    let csv = '\ufeff';
    if (type === 'teacher') {
      csv += 'Fecha,Hora,ID de clase,Curso,Docente,Estado\n';
      const session = classData.class_session as any;
      const status = session?.recovery_for_session_id
        ? 'reprogramada'
        : this.normalizeSessionStatus(session?.status) === 'cancelled'
          ? 'cancelada'
          : 'cerrada';
      csv += [
        session?.date || '',
        session?.start_time || '',
        session?.class_display_id || '',
        session?.course_name || session?.name || '',
        classData.teacher || '',
        status,
      ].join(',') + '\n';
    } else {
      csv += 'ID de clase,Alumno,Estado\n';
      for (const student of classData.students || []) {
        csv += [classData.class_session?.class_display_id || '', student.name || student.email, student.status].join(',') + '\n';
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="admin-clase-${classId}-${type}.csv"`);
    res.status(200).send(csv);
  }

  @Get('history')
  async history(@Request() req, @Query('editionId') editionId?: string) {
    let query = this.supabaseService.getClient()
      .from('class_session')
      .select(`
        id, date, status, recovery_for_session_id, learning_proposal_edition_id,
        external_class_session_id, external_id, name, subject, location_classroom, classroom
      `)
      .eq('tenant_id', req.user.tenant_id)
      .order('date', { ascending: false });

    if (editionId) query = query.eq('learning_proposal_edition_id', editionId);

    const { data: sessions, error } = await query;
    if (error) throw new BadRequestException(error.message);

    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    const { data: openLogs } = await this.supabaseService.getClient()
      .from('audit_log')
      .select(`
        record_id, created_at,
        app_user:actor_id (email)
      `)
      .eq('tenant_id', req.user.tenant_id)
      .eq('action', 'OPEN_ATTENDANCE')
      .in('record_id', sessionIds.length > 0 ? sessionIds : ['__none__'])
      .order('created_at', { ascending: false });

    const teacherBySession = new Map<string, string>();
    for (const log of openLogs ?? []) {
      if (!teacherBySession.has((log as any).record_id)) {
        teacherBySession.set((log as any).record_id, (log as any).app_user?.email || 'Sin docente');
      }
    }

    return (sessions ?? []).map((session: any) => ({
      id: session.id,
      date: session.date,
      class_display_id: this.buildClassDisplayId(session),
      course_name: session.subject || session.name || 'Curso',
      teacher: teacherBySession.get(session.id) || 'Sin docente',
      status: session.recovery_for_session_id
        ? 'reprogramada'
        : this.normalizeSessionStatus(session.status) === 'cancelled'
          ? 'cancelada'
          : 'cerrada',
    }));
  }
}
