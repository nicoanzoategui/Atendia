import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { SyncController } from './sync.controller';
import { HistoryController } from './history.controller';
import { ExportController } from './export.controller';
import { AttendancePhotoController } from './attendance-photo.controller';
import { QrModule } from '../qr/qr.module';

@Module({
  imports: [QrModule],
  providers: [AttendanceService],
  controllers: [
    AttendanceController,
    AttendancePhotoController,
    SyncController,
    HistoryController,
    ExportController,
  ],
  exports: [AttendanceService]
})
export class AttendanceModule {}
