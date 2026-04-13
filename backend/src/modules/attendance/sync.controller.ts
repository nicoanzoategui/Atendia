import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class SyncController {
  constructor(private attendanceService: AttendanceService) {}

  @Post('sync')
  async sync(@Body() body: { records: any[] }, @Request() req) {
    const results: any[] = [];
    for (const record of body.records) {
      try {
        // The service should handle idempotency via offline_id
        const result = await this.attendanceService.registerByQr(
          record.student_id,
          record.qr_token,
          record.offline_id
        );
        results.push({ offline_id: record.offline_id, status: 'synced' });
      } catch (e: any) {
        if (e.message?.includes('duplicate key')) {
          results.push({ offline_id: record.offline_id, status: 'already_synced' });
        } else {
          results.push({ offline_id: record.offline_id, status: 'error', message: e.message });
        }
      }
    }
    return results;
  }
}
