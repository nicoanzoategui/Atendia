import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class QrService {
  private readonly secret = process.env.QR_SECRET || 'fallback-secret';

  generateToken(sessionId: string, expiresAt: number) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = JSON.stringify({
      class_id: sessionId,
      expires_at: expiresAt,
      nonce: nonce,
    });

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    const tokenData = {
      ...JSON.parse(payload),
      signature,
    };

    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
  }

  validateToken(base64Token: string) {
    try {
      const json = Buffer.from(base64Token, 'base64').toString('utf8');
      const data = JSON.parse(json);
      const { signature, ...payloadObj } = data;
      const payload = JSON.stringify(payloadObj);

      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new BadRequestException('Firma QR inválida');
      }

      const now = Date.now();
      // Permitir margen de ±5 min para relojes desincronizados según spec
      const margin = 5 * 60 * 1000;
      if (now > data.expires_at + margin) {
        throw new BadRequestException('QR expirado');
      }

      return data;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Token QR corrupto');
    }
  }
}
