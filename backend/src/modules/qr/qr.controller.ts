import { Controller, Post, Param, Query, UseGuards } from '@nestjs/common';
import { QrService } from './qr.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('qr-tokens')
export class QrController {
  constructor(private qrService: QrService) {}

  @Roles('teacher')
  @Post('session/:id')
  async generateToken(
    @Param('id') id: string,
    @Query('count') count?: string,
  ) {
    const tokenCount = Math.min(Math.max(parseInt(count || '1', 10) || 1, 1), 50);
    const TTL_MS = parseInt(process.env.QR_TOKEN_TTL_MINUTES || '10', 10) * 60 * 1000;

    if (tokenCount === 1) {
      const expiresAt = Date.now() + TTL_MS;
      return { token: this.qrService.generateToken(id, expiresAt), expiresAt };
    }

    // Pool para pre-carga offline: token i expira TTL * (i+1) ms desde ahora
    return Array.from({ length: tokenCount }, (_, i) => {
      const expiresAt = Date.now() + TTL_MS * (i + 1);
      return { token: this.qrService.generateToken(id, expiresAt), expiresAt };
    });
  }
}
