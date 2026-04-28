import { Controller, Get, Patch, Param, UseGuards, Request, Body, Post } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Roles('student')
  @Get('my-course')
  async getMyCourse(@Request() req) {
    return this.sessionsService.getMyCourse(req.user.userId, req.user.tenant_id);
  }

  @Roles('teacher')
  @Get('today')
  async getTodaySessions(@Request() req) {
    return this.sessionsService.listTodaySessions(req.user.userId, req.user.tenant_id);
  }

  @Roles('teacher', 'student')
  @Get('edition/:editionId')
  async getSessionsByEdition(@Param('editionId') editionId: string, @Request() req) {
    if (req.user.role === 'student') {
      return this.sessionsService.getSessionsByEditionForStudent(
        editionId,
        req.user.userId,
        req.user.tenant_id,
      );
    }
    return this.sessionsService.getSessionsByEdition(editionId, req.user.tenant_id);
  }

  @Roles('teacher')
  @Get('edition/:editionId/stats')
  async getEditionStats(@Param('editionId') editionId: string, @Request() req) {
    return this.sessionsService.getEditionStats(editionId, req.user.tenant_id);
  }

  @Roles('teacher')
  @Get('edition/:editionId/student-stats')
  async getEditionStudentStats(@Param('editionId') editionId: string, @Request() req) {
    return this.sessionsService.getEditionStudentStats(editionId, req.user.tenant_id);
  }

  @Roles('teacher')
  @Post(':id/roster/from-document')
  async addStudentToRosterByDocument(
    @Param('id') id: string,
    @Body() body: { document: string; firstName?: string; lastName?: string },
    @Request() req,
  ) {
    return this.sessionsService.addStudentToRosterByDocument(
      id,
      req.user.userId,
      req.user.tenant_id,
      body,
    );
  }

  @Get(':id')
  async getSession(@Param('id') id: string, @Request() req) {
    return this.sessionsService.getSession(id, req.user.tenant_id);
  }

  @Roles('teacher')
  @Patch(':id/open')
  async openSession(@Param('id') id: string, @Request() req) {
    return this.sessionsService.openSession(id, req.user.userId);
  }

  @Roles('teacher')
  @Patch(':id/close')
  async closeSession(@Param('id') id: string, @Request() req) {
    return this.sessionsService.closeSession(id, req.user.userId);
  }

  @Roles('teacher')
  @Patch(':id/cancel')
  async cancelSession(
    @Param('id') id: string,
    @Body() body: { comment: string },
    @Request() req
  ) {
    return this.sessionsService.cancelSession(id, req.user.userId, body.comment);
  }

  @Roles('teacher')
  @Post(':id/recovery')
  async addRecoverySession(
    @Param('id') id: string,
    @Body() body: { date: string; start_time: string; end_time: string; classroom?: string },
    @Request() req
  ) {
    return this.sessionsService.addRecoverySession(id, req.user.userId, body);
  }

  @Roles('teacher')
  @Get(':id/students')
  async getStudents(@Param('id') id: string) {
    return this.sessionsService.getStudents(id);
  }
}
