import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { QrModule } from './modules/qr/qr.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AdminModule } from './modules/admin/admin.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { CommonModule } from './modules/common/common.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 60 },
    ]),
    CommonModule,
    AuthModule,
    SupabaseModule,
    SessionsModule,
    QrModule,
    AttendanceModule,
    AdminModule,
    IntegrationModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
