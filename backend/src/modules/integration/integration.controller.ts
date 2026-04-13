import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type UpsertClassBody = {
  external_id?: string;
  name?: string;
  subject?: string | null;
  modality?: 'in_person' | 'online';
  date?: string;
  start_time?: string;
  end_time?: string;
  location_campus?: string | null;
  location_building?: string | null;
  location_classroom?: string | null;
  location_floor?: string | null;
  location_online_url?: string | null;
  status?: 'scheduled' | 'attendance_open' | 'attendance_closed' | 'finalized' | 'cancelled';
  metadata_jsonb?: Record<string, any> | null;
};

@Controller('api/v1/classes')
export class IntegrationController {
  constructor(private readonly supabaseService: SupabaseService) {}

  private async resolveTenant(apiKey?: string) {
    if (!apiKey) {
      throw new BadRequestException('API key requerida.');
    }

    const { data, error } = await this.supabaseService.getClient()
      .from('tenant_api_key')
      .select('tenant_id, name, is_active')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      throw new BadRequestException('API key inválida.');
    }

    return data.tenant_id as string;
  }

  private normalizeClassPayload(body: UpsertClassBody) {
    const payload = {
      external_id: body.external_id,
      name: body.name,
      subject: body.subject ?? null,
      modality: body.modality ?? 'in_person',
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      location_campus: body.location_campus ?? null,
      location_building: body.location_building ?? null,
      location_classroom: body.location_classroom ?? null,
      location_floor: body.location_floor ?? null,
      location_online_url: body.location_online_url ?? null,
      classroom: body.location_classroom ?? null,
      status: body.status ?? 'scheduled',
      metadata_jsonb: body.metadata_jsonb ?? {},
      updated_at: new Date().toISOString(),
    };

    return payload;
  }

  @Post()
  async createClass(
    @Headers('x-api-key') apiKey: string,
    @Body() body: UpsertClassBody,
  ) {
    const tenantId = await this.resolveTenant(apiKey);

    if (!body.external_id || !body.name || !body.date || !body.start_time || !body.end_time) {
      throw new BadRequestException('external_id, name, date, start_time y end_time son obligatorios.');
    }

    const payload = this.normalizeClassPayload(body);
    const db = this.supabaseService.getClient();

    const row = {
      tenant_id: tenantId,
      ...payload,
    };

    const { data, error } = await db
      .from('class_session')
      .upsert(row, { onConflict: 'tenant_id,external_id' })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  @Patch(':externalId')
  async updateClass(
    @Headers('x-api-key') apiKey: string,
    @Param('externalId') externalId: string,
    @Body() body: UpsertClassBody,
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    const payload = this.normalizeClassPayload({ ...body, external_id: externalId });

    const patchPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );

    const { data, error } = await this.supabaseService.getClient()
      .from('class_session')
      .update(patchPayload)
      .eq('tenant_id', tenantId)
      .eq('external_id', externalId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  @Put(':externalId/students')
  async replaceRoster(
    @Headers('x-api-key') apiKey: string,
    @Param('externalId') externalId: string,
    @Body() body: { students: Array<{ student_external_id: string; student_name?: string | null }> },
  ) {
    const tenantId = await this.resolveTenant(apiKey);
    const { data: classSession, error: classError } = await this.supabaseService.getClient()
      .from('class_session')
      .select('id, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('external_id', externalId)
      .single();

    if (classError || !classSession) {
      throw new BadRequestException('Clase no encontrada para ese external_id.');
    }

    await this.supabaseService.getClient()
      .from('class_session_student')
      .delete()
      .eq('class_session_id', classSession.id);

    const students = (body.students || []).map((student) => ({
      tenant_id: tenantId,
      class_session_id: classSession.id,
      student_external_id: student.student_external_id,
      student_name: student.student_name ?? null,
      updated_at: new Date().toISOString(),
    }));

    if (students.length > 0) {
      const { error } = await this.supabaseService.getClient()
        .from('class_session_student')
        .insert(students);

      if (error) throw new BadRequestException(error.message);
    }

    return { ok: true, count: students.length };
  }
}
