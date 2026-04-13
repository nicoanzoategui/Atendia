import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SupabaseService } from '../supabase/supabase.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

type RosterRow = { student_name: string | null; student_external_id: string | null };

type GeminiRow = {
  student_external_id?: string;
  status?: string;
  confidence?: number;
};

function normalizeStatus(raw: string | undefined): 'present' | 'absent' | 'excused' {
  const x = (raw ?? '').toLowerCase().trim();
  if (x === 'present' || x === 'presente' || x === 'p') return 'present';
  if (x === 'excused' || x === 'justified' || x === 'justificado' || x === 'j') return 'excused';
  return 'absent';
}

type UploadedImageFile = { buffer: Buffer; mimetype: string; originalname?: string };

function extractJsonArray(text: string): GeminiRow[] {
  const t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i;
  const m = t.match(fence);
  const raw = m ? m[1].trim() : t;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new BadRequestException('La respuesta del modelo no contiene un JSON array válido');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new BadRequestException('La respuesta del modelo no es un array');
  }
  return parsed as GeminiRow[];
}

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function inlineMimeType(mime: string): string {
  const m = mime.toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  return m;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendancePhotoController {
  private readonly logger = new Logger(AttendancePhotoController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  @Roles('teacher')
  @Post('analyze-photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async analyzePhoto(
    @UploadedFile() photo: UploadedImageFile | undefined,
    @Body('sessionId') sessionId: string | undefined,
  ) {
    const sid = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!sid) {
      throw new BadRequestException('sessionId es obligatorio');
    }
    if (!photo?.buffer?.length) {
      throw new BadRequestException('Archivo photo requerido (jpg/png)');
    }
    const mime = (photo.mimetype || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new BadRequestException('Formato de imagen no soportado (JPG, PNG, WEBP o HEIC)');
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('GEMINI_API_KEY no configurada');
    }

    const { data: rosterRows, error: rosterError } = await this.supabaseService
      .getClient()
      .from('class_session_student')
      .select('student_name, student_external_id')
      .eq('class_session_id', sid);

    if (rosterError) {
      throw new BadRequestException(rosterError.message);
    }

    const roster: RosterRow[] = (rosterRows ?? []).map((r) => ({
      student_name: r.student_name ?? null,
      student_external_id: r.student_external_id ?? null,
    }));

    const rosterLines = roster
      .filter((r) => r.student_external_id != null && String(r.student_external_id).trim() !== '')
      .map(
        (a) =>
          `- ID: ${String(a.student_external_id)}, Nombre: ${a.student_name?.trim() || 'Sin nombre'}`,
      )
      .join('\n');

    const prompt = `Sos un asistente que analiza listas de asistencia escolares.
Analizá esta imagen de una lista de asistencia completada a mano.

El roster de alumnos es:
${rosterLines}

Para cada alumno identificado en la imagen, determiná su estado:
- presente: si hay una marca, tilde, firma o 'P' en la columna de presente
- absent: si hay una marca en ausente o no hay ninguna marca
- excused: si hay una marca en justificado o 'J'

Respondé SOLO con un JSON array con este formato exacto (comillas dobles):
[
  { "student_external_id": "S-001", "status": "present", "confidence": 0.95 },
  { "student_external_id": "S-002", "status": "absent", "confidence": 0.80 }
]

Usá status en inglés: "present", "absent" o "excused".
Incluí TODOS los alumnos del roster aunque no aparezcan en la imagen.
Si no podés determinar el estado con certeza, usá confidence menor a 0.7.`;

    const base64 = photo.buffer.toString('base64');
    const genAI = new GoogleGenerativeAI(apiKey);
    // gemini-2.0-flash was retired for new API keys; override with GEMINI_MODEL if Google renames again.
    const modelId = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({ model: modelId });

    let result: Awaited<ReturnType<typeof model.generateContent>>;
    try {
      result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: inlineMimeType(mime),
            data: base64,
          },
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Gemini generateContent failed (${modelId}): ${msg}`);
      throw new HttpException(
        `No se pudo analizar la imagen con el modelo (${modelId}). ${msg}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const response = result.response;
    let text: string;
    try {
      text = response.text();
    } catch {
      const block = response.promptFeedback?.blockReason;
      const finish = response.candidates?.[0]?.finishReason;
      this.logger.warn(
        `Gemini sin texto útil: blockReason=${block ?? '—'} finishReason=${finish ?? '—'}`,
      );
      throw new BadRequestException(
        block
          ? `La imagen fue rechazada por la política del modelo (${block}). Probá otra foto o iluminación.`
          : 'El modelo no devolvió texto. Probá otra foto más nítida.',
      );
    }
    let parsed: GeminiRow[];
    try {
      parsed = extractJsonArray(text);
    } catch (e) {
      throw new BadRequestException(
        e instanceof BadRequestException ? e.message : 'No se pudo interpretar la respuesta del modelo',
      );
    }

    const byExt = new Map<string, { status: 'present' | 'absent' | 'excused'; confidence: number }>();
    for (const row of parsed) {
      const ext = row.student_external_id != null ? String(row.student_external_id).trim() : '';
      if (!ext) continue;
      const conf =
        typeof row.confidence === 'number' && Number.isFinite(row.confidence)
          ? Math.min(1, Math.max(0, row.confidence))
          : 0.5;
      byExt.set(ext, { status: normalizeStatus(row.status), confidence: conf });
    }

    const rosterKeys = new Set(
      roster
        .map((r) => (r.student_external_id != null ? String(r.student_external_id).trim() : ''))
        .filter(Boolean),
    );

    const results = roster.map((r) => {
      const ext =
        r.student_external_id != null && String(r.student_external_id).trim() !== ''
          ? String(r.student_external_id).trim()
          : '';
      const name = r.student_name?.trim() || 'Sin nombre';
      const hit = ext ? byExt.get(ext) : undefined;
      const status = hit?.status ?? 'absent';
      const confidence = hit?.confidence ?? 0.5;
      return {
        student_external_id: ext,
        student_name: name,
        status,
        confidence,
      };
    });

    const unmatched: GeminiRow[] = [];
    for (const ext of byExt.keys()) {
      if (!rosterKeys.has(ext)) {
        const v = byExt.get(ext);
        unmatched.push({
          student_external_id: ext,
          status: v?.status,
          confidence: v?.confidence,
        });
      }
    }

    return {
      results,
      unmatched,
      total: results.length,
      sessionId: sid,
    };
  }
}
