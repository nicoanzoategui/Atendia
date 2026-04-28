import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Roles('student')
  @Post('qr')
  async registerByQr(@Body() body: { token: string }, @Request() req) {
    return this.attendanceService.registerByQr(req.user.userId, body.token);
  }

  @Roles('teacher')
  @Post('manual')
  async registerManual(
    @Body()
    body: {
      sessionId: string;
      status: string;
      /** UUID en app_user */
      studentId?: string;
      /** ID de campus / legajo (misma columna que en la comisión) */
      studentExternalId?: string;
      method?: 'manual_teacher' | 'ocr_upload' | 'admin';
    },
    @Request() req
  ) {
    return this.attendanceService.registerManual(body, req.user.userId);
  }

  /** Tras guardar asistencias desde lista en papel, registra el ID de lista del PDF (anti-duplicado). */
  @Roles('teacher')
  @Post('sheet-processed')
  async markSheetProcessed(
    @Body() body: { sessionId: string; listId: string },
    @Request() req
  ) {
    return this.attendanceService.markSheetProcessed(
      body.sessionId,
      body.listId,
      req.user.userId,
    );
  }
}
