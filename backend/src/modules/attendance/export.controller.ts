import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('attendance/export')
export class ExportController {
  constructor(private supabaseService: SupabaseService) {}

  @Get('session/:id')
  @Roles('teacher')
  @UseGuards(RolesGuard)
  async exportSession(@Param('id') sessionId: string, @Res() res: Response) {
    const { data: students } = await this.supabaseService.getClient()
      .from('class_session_student')
      .select('student_id, student_external_id, student_name, app_user:student_id(email, external_id)')
      .eq('class_session_id', sessionId);

    const { data: records } = await this.supabaseService.getClient()
      .from('attendance_record')
      .select('*')
      .eq('class_session_id', sessionId);

    const recordMap = new Map((records ?? []).map((r: any) => [r.student_id || r.student_external_id, r]));

    let csvContent = '\ufeffID,Email,Estado,Metodo,Fecha Registro\n';

    for (const s of students ?? []) {
      const student = s as any;
      const record = recordMap.get(student.student_id || student.student_external_id) as any;
      const user = Array.isArray(student.app_user) ? student.app_user[0] : student.app_user;
      const row = [
        student.student_external_id || user?.external_id || '',
        student.student_name || user?.email || '',
        record?.status || 'ausente',
        record?.method || '-',
        record?.created_at || '-',
      ].join(',');
      csvContent += row + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-sesion-${sessionId}.csv"`);
    res.status(200).send(csvContent);
  }
}
