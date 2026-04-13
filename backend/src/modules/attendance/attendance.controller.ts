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
    @Body() body: { studentId: string; sessionId: string; status: string },
    @Request() req
  ) {
    return this.attendanceService.registerManual(
      body.studentId,
      body.sessionId,
      body.status,
      req.user.userId
    );
  }
}
