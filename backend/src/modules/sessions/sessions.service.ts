import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SessionsService {
  constructor(private supabaseService: SupabaseService) {}

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
      session?.learning_proposal_id ||
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

  private enrichSession(session: any) {
    const normalizedStatus = this.normalizeSessionStatus(session?.status);
    return {
      ...session,
      status: normalizedStatus,
      legacy_status: session?.status,
      classroom: session?.location_classroom || session?.classroom || null,
      course_name: session?.name || session?.subject || session?.learning_proposal?.name || session?.learning_proposal_edition?.name || 'Clase',
      class_display_id: this.buildClassDisplayId(session),
    };
  }

  async listTodaySessions(teacherId: string, tenantId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .select(`
        *,
        learning_proposal (name),
        learning_proposal_edition (name),
        class_session_teacher!inner (teacher_id),
        class_session_student (count)
      `)
      .eq('tenant_id', tenantId)
      .eq('class_session_teacher.teacher_id', teacherId);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((session) => this.enrichSession(session));
  }

  async getSessionsByEdition(editionId: string, tenantId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .select(`
        *,
        learning_proposal (name),
        learning_proposal_edition (name),
        class_session_student (count)
      `)
      .eq('learning_proposal_edition_id', editionId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((session) => this.enrichSession(session));
  }

  /**
   * Misma lista que getSessionsByEdition, con my_attendance del alumno.
   * Lanza Forbidden si el estudiante no está inscripto en ninguna sesión de esa cursada.
   */
  async getSessionsByEditionForStudent(editionId: string, studentId: string, tenantId: string) {
    const { data: editionSessions, error: sessErr } = await this.supabaseService.getClient()
      .from('class_session')
      .select('id')
      .eq('learning_proposal_edition_id', editionId)
      .eq('tenant_id', tenantId);

    if (sessErr) throw new BadRequestException(sessErr.message);
    const sessionIds = (editionSessions ?? []).map((s) => s.id);
    if (sessionIds.length === 0) {
      return [];
    }

    const { data: enrollment, error: enrErr } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select('id')
      .eq('student_id', studentId)
      .in('class_session_id', sessionIds)
      .limit(1);

    if (enrErr) throw new BadRequestException(enrErr.message);
    if (!enrollment?.length) {
      throw new ForbiddenException();
    }

    const sessions = await this.getSessionsByEdition(editionId, tenantId);
    const { data: records } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select('class_session_id, status, method, student_id, student_external_id')
      .eq('student_id', studentId)
      .in('class_session_id', sessionIds);

    const attendanceMap = new Map((records ?? []).map((r) => [r.class_session_id, r]));

    return sessions.map((s) => ({
      ...s,
      my_attendance: attendanceMap.get(s.id) || null,
    }));
  }

  async getEditionStats(editionId: string, tenantId: string) {
    // 1. All sessions for course
    const { data: sessions } = await this.supabaseService.getClient()
      .from('class_session')
      .select('id, external_id, name, subject, start_time, date, status, classroom, location_classroom, learning_proposal (name), learning_proposal_edition (name)')
      .eq('learning_proposal_edition_id', editionId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (!sessions || sessions.length === 0) {
      return {
        courseName: 'Desconocido', 
        editionName: 'Desconocido', 
        totalStudents: 0, 
        averageAttendance: 0, 
        classBreakdown: []
      };
    }

    const sessionIds = sessions.map(s => s.id);

    // 2. Map target students
    const { data: enrollments } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select('class_session_id, student_id')
      .in('class_session_id', sessionIds);

    const expectedPerSession = new Map<string, number>();
    const uniqueStudents = new Set<string>();

    (enrollments || []).forEach(e => {
      uniqueStudents.add(e.student_id);
      expectedPerSession.set(e.class_session_id, (expectedPerSession.get(e.class_session_id) || 0) + 1);
    });

    // 3. Map present / late
    const { data: records } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select('status, class_session_id')
      .in('class_session_id', sessionIds);

    const presentPerSession = new Map<string, number>();
    
    (records || []).forEach(r => {
      if (r.status === 'present' || r.status === 'late') {
        presentPerSession.set(r.class_session_id, (presentPerSession.get(r.class_session_id) || 0) + 1);
      }
    });

    const classBreakdown = sessions.filter(s => {
      const status = this.normalizeSessionStatus(s.status);
      return status === 'attendance_closed' || status === 'finalized';
    }).map(s => {
      const expected = expectedPerSession.get(s.id) || 0;
      const actual = presentPerSession.get(s.id) || 0;
      return {
        id: s.id,
        class_display_id: this.buildClassDisplayId(s),
        date: s.date,
        time: s.start_time?.slice(0, 5),
        expected,
        actual,
        percentage: expected > 0 ? Math.round((actual / expected) * 100) : 0
      };
    });

    const totalClosed = classBreakdown.length;
    const avgAtt = totalClosed > 0 
      ? Math.round(classBreakdown.reduce((sum, curr) => sum + curr.percentage, 0) / totalClosed) 
      : 0;

    const firstSession = sessions[0] as any;
    return {
      editionId,
      courseName: firstSession?.name || firstSession?.subject || firstSession?.learning_proposal?.name || 'Clase',
      editionName: firstSession?.learning_proposal_edition?.name || 'Edición',
      totalStudents: uniqueStudents.size || 30, // fallback just in case
      averageAttendance: avgAtt,
      classBreakdown,
      activeSessions: sessions.filter(s => !['attendance_closed', 'finalized', 'cancelled'].includes(this.normalizeSessionStatus(s.status))).length
    };
  }

  async getSession(sessionId: string, tenantId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .select(`
        *,
        learning_proposal (name),
        learning_proposal_edition (name)
      `)
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw new BadRequestException('Session not found');
    return this.enrichSession(data);
  }

  async openSession(sessionId: string, teacherId: string) {
    const { data: currentSession } = await this.supabaseService.getClient()
      .from('class_session')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (this.normalizeSessionStatus(currentSession?.status) === 'cancelled') {
      throw new BadRequestException('La clase fue cancelada en Sofia y no puede abrirse.');
    }

    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .update({ status: 'attendance_open', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.supabaseService.getClient()
      .from('audit_log')
      .insert({
        table_name: 'class_session',
        record_id: data.id,
        action: 'OPEN_ATTENDANCE',
        new_data: {
          class_session_id: data.id,
          learning_proposal_edition_id: data.learning_proposal_edition_id,
          external_id: data.external_id,
          date: data.date,
        },
        actor_id: teacherId,
        tenant_id: data.tenant_id,
      });

    return this.enrichSession(data);
  }

  async closeSession(sessionId: string, teacherId: string) {
    const { data: currentSession } = await this.supabaseService.getClient()
      .from('class_session')
      .select('id, tenant_id')
      .eq('id', sessionId)
      .single();

    // [MVP] Mark remaining students as 'absent'
    const { data: students } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select('student_id')
      .eq('class_session_id', sessionId);

    const { data: records } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select('student_id')
      .eq('class_session_id', sessionId);

    const recordedStudentIds = new Set((records ?? []).map(r => r.student_id));
    const toMarkAbsent = (students ?? [])
      .filter(s => !recordedStudentIds.has(s.student_id))
      .map(s => ({
        class_session_id: sessionId,
        student_id: s.student_id,
        tenant_id: currentSession?.tenant_id,
        status: 'absent',
        method: 'admin', // Automatic mark
        sync_status: 'synced',
        updated_at: new Date().toISOString()
      }));

    if (toMarkAbsent.length > 0) {
      await this.supabaseService.getClient()
        .from('attendance_record')
        .insert(toMarkAbsent);
    }

    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .update({ status: 'attendance_closed', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return this.enrichSession(data);
  }

  async cancelSession(sessionId: string, teacherId: string, comment: string) {
    throw new BadRequestException('El docente no puede cancelar clases desde este panel.');
  }

  async addRecoverySession(
    sourceSessionId: string,
    teacherId: string,
    payload: { date: string; start_time: string; end_time: string; classroom?: string | null }
  ) {
    throw new BadRequestException('El docente no puede reprogramar clases desde este panel.');
  }
  
  async getMyCourse(studentId: string, tenantId: string) {
    // 1. Find the edition(s) this student is enrolled in
    const { data: enrollments, error: enrollErr } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select(`
        class_session (
          id,
          learning_proposal_edition_id,
          tenant_id
        )
      `)
      .eq('student_id', studentId)
      .limit(1);

    if (enrollErr || !enrollments || enrollments.length === 0) return null;

    // Get the edition from the first enrolled session
    const firstSession = enrollments[0].class_session as any;
    const editionId = firstSession?.learning_proposal_edition_id;
    if (!editionId) return null;

    // 2. Get edition + proposal info
    const { data: edition } = await this.supabaseService.getClient()
      .from('learning_proposal_edition')
      .select(`
        id, name,
        learning_proposal (id, name)
      `)
      .eq('id', editionId)
      .single();

    // 3. Get all sessions for this edition ordered by date
    const { data: sessions, error: sessErr } = await this.supabaseService.getClient()
      .from('class_session')
      .select(`*, learning_proposal (name), learning_proposal_edition (name), class_session_student (count)`)
      .eq('learning_proposal_edition_id', editionId)
      .eq('tenant_id', tenantId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (sessErr) throw new BadRequestException(sessErr.message);

    // 4. Get student's attendance records for these sessions
    const sessionIds = (sessions ?? []).map(s => s.id);
    const { data: records } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select('class_session_id, status, method, student_id, student_external_id')
      .eq('student_id', studentId)
      .in('class_session_id', sessionIds.length > 0 ? sessionIds : ['__none__']);

    const attendanceMap = new Map((records ?? []).map(r => [r.class_session_id, r]));

    const enrichedSessions = (sessions ?? []).map((s, i) => ({
      ...this.enrichSession(s),
      session_number: i + 1,
      my_attendance: attendanceMap.get(s.id) || null,
    }));

    return {
      edition,
      sessions: enrichedSessions,
    };
  }

  async getEditionStudentStats(editionId: string, tenantId: string) {
    // 1. Get all closed sessions for this edition
    const { data: sessions } = await this.supabaseService.getClient()
      .from('class_session')
      .select('id')
      .eq('learning_proposal_edition_id', editionId)
      .eq('tenant_id', tenantId)
      .in('status', ['attendance_closed', 'finalized', 'closed', 'synced']);

    const sessionIds = (sessions ?? []).map(s => s.id);
    const totalClosed = sessionIds.length;

    if (totalClosed === 0) return [];

    // 2. Get all unique students enrolled in these sessions with their user info
    const { data: enrollments } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select('student_id, app_user (email)')
      .in('class_session_id', sessionIds);

    // Build unique student map
    const studentMap = new Map<string, { email: string }>();
    (enrollments ?? []).forEach((e: any) => {
      if (!studentMap.has(e.student_id)) {
        studentMap.set(e.student_id, { email: e.app_user?.email || '' });
      }
    });

    // 3. Get attendance records for closed sessions
    const { data: records } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select('student_id, status')
      .in('class_session_id', sessionIds);

    // Count present/late per student
    const presentCount = new Map<string, number>();
    (records ?? []).forEach(r => {
      if (r.status === 'present' || r.status === 'late') {
        presentCount.set(r.student_id, (presentCount.get(r.student_id) || 0) + 1);
      }
    });

    // 4. Build result
    return Array.from(studentMap.entries()).map(([studentId, info]) => {
      const present = presentCount.get(studentId) || 0;
      const email = info.email;
      const parts = email.split('@')[0].split('.');
      const name = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || email;
      return {
        student_id: studentId,
        name,
        email,
        present,
        total: totalClosed,
        percentage: totalClosed > 0 ? Math.round((present / totalClosed) * 100) : 0,
      };
    }).sort((a, b) => b.percentage - a.percentage);
  }

  async getStudents(sessionId: string) {
    const { data, error } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select(`
        *,
        app_user (email, external_id)
      `)
      .eq('class_session_id', sessionId);

    if (error) throw new BadRequestException(error.message);
    
    // Get current attendance for these students
    const { data: attendance, error: attendanceError } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select('*')
      .eq('class_session_id', sessionId);
      
    if (attendanceError) throw new BadRequestException(attendanceError.message);

    return data.map(s => ({
      ...s,
      class_display_id: this.buildClassDisplayId({
        ...s,
        classroom: s.class_session?.classroom,
      }),
      attendance: attendance.find(a => a.student_id === s.student_id) || null
    }));
  }
}
