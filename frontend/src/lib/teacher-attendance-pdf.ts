import { jsPDF } from 'jspdf';
import { apiClient } from '@/lib/api/client';
import { formatCourseDisplayTitle } from '@/lib/course-display-name';

export type TeacherSessionPdfRow = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  course_name?: string;
  name?: string;
  subject?: string;
  location_classroom?: string;
  classroom?: string;
  location_campus?: string;
  learning_proposal_edition?: { name?: string } | { name?: string }[];
  learning_proposal?: { name?: string } | { name?: string }[];
};

type SessionStudentRow = {
  student_name?: string | null;
  student_external_id?: string | null;
  student_id?: string | null;
  student_dni?: string | null;
  dni?: string | null;
  national_id?: string | null;
  document_number?: string | null;
};

function rawProposalName(s: TeacherSessionPdfRow): string | undefined {
  const lp = s.learning_proposal;
  const pn = Array.isArray(lp) ? lp[0]?.name : lp?.name;
  if (pn == null) return undefined;
  const t = String(pn).trim();
  return t === '' ? undefined : String(pn);
}

function rawEditionName(s: TeacherSessionPdfRow): string | undefined {
  const le = s.learning_proposal_edition;
  const en = Array.isArray(le) ? le[0]?.name : le?.name;
  if (en == null) return undefined;
  const t = String(en).trim();
  return t === '' ? undefined : String(en);
}

function rawCourseNameField(s: TeacherSessionPdfRow): string | undefined {
  const cn = s.course_name ?? s.name ?? s.subject;
  if (cn == null) return undefined;
  const t = String(cn).trim();
  return t === '' ? undefined : String(cn);
}

function courseNameForPdf(session: TeacherSessionPdfRow, fallbackTitle: string): string {
  const raw =
    rawProposalName(session) ??
    rawEditionName(session) ??
    rawCourseNameField(session) ??
    fallbackTitle;
  return formatCourseDisplayTitle(String(raw));
}

function pickStudentDni(s: SessionStudentRow): string {
  const r = s as Record<string, unknown>;
  const candidates = [
    s.student_dni,
    s.dni,
    s.national_id,
    s.document_number,
    r.studentDni,
    r.nationalId,
    r.documentNumber,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const t = String(c).trim();
    if (t !== '') return t;
  }
  return '—';
}

function formatDateDDMMYYYY(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map((x) => Number(x));
  if (!y || !m || !d) return isoDate;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function timeRange(session: TeacherSessionPdfRow): string {
  const a = session.start_time?.slice(0, 5) ?? '—';
  const b = session.end_time?.slice(0, 5) ?? '—';
  return `${a} - ${b}`;
}

export async function generateAttendancePDF(
  session: TeacherSessionPdfRow,
  courseTitle: string,
  teacherLabel: string,
): Promise<void> {
  const students = await apiClient<SessionStudentRow[]>(
    `/sessions/${encodeURIComponent(session.id)}/students`,
  );
  const list = Array.isArray(students) ? students : [];

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const pageBottom = pageH - 24;
  let y = 18;

  const courseLine = courseNameForPdf(session, courseTitle);
  const dateStr = formatDateDDMMYYYY(session.date);
  const horario = timeRange(session);
  const aula = session.location_classroom || session.classroom || '—';
  const sede = session.location_campus || '—';
  const listId =
    typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `L-${Date.now()}`;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LISTA DE ASISTENCIA', margin, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  for (const line of [
    `Curso: ${courseLine}`,
    `Fecha: ${dateStr}`,
    `Horario: ${horario}`,
    `Aula: ${aula}`,
    `Sede: ${sede}`,
    `Docente: ${teacherLabel}`,
    `ID de lista (no reutilizar en otro acta): ${listId}`,
  ]) {
    doc.text(line, margin, y);
    y += 5.5;
  }
  y += 4;

  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  const MANUAL_EXTRA_ROWS = 5;

  const instrLines = [
    'INSTRUCCIONES PARA COMPLETAR:',
    '· Columna PRESENTE: marcar con ✓ si asistió.',
    '· Columna AUSENTE: escribir "A" o marcar con X si no asistió (no dejar vacío).',
    '· Columna JUSTIFICADO: marcar con J si corresponde.',
    '· Todos los ausentes deben estar marcados explícitamente.',
    '· El docente debe firmar al pie. No dejar casillas sin marca para evitar alteraciones.',
    `· Tabla inferior: hasta ${MANUAL_EXTRA_ROWS} alumnos que no figuran en el sistema; completar nombre, DNI, ID y firmar.`,
  ];
  const instrH = 5.2;
  doc.rect(margin, y, contentW, instrLines.length * instrH + 4, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  let iy = y + 5;
  for (const ln of instrLines) {
    doc.text(ln, margin + 2, iy);
    iy += instrH;
  }
  y = iy + 4;
  doc.setFont('helvetica', 'normal');

  const col = { num: 12, name: 52, dni: 24, id: 24, p: 16, a: 16, j: 16, firma: 22, obs: 22 } as const;
  const sum = col.num + col.name + col.dni + col.id + col.p + col.a + col.j + col.firma + col.obs;
  const scale = contentW / sum;
  const W = {
    num: col.num * scale,
    name: col.name * scale,
    dni: col.dni * scale,
    id: col.id * scale,
    p: col.p * scale,
    a: col.a * scale,
    j: col.j * scale,
    firma: col.firma * scale,
    obs: col.obs * scale,
  };
  const rowH = 8;
  const headerH = 9;
  const headerLabels: [string, number][] = [
    ['N°', W.num],
    ['Nombre', W.name],
    ['DNI', W.dni],
    ['ID sistema', W.id],
    ['Presente', W.p],
    ['Ausente', W.a],
    ['Justif.', W.j],
    ['Firma', W.firma],
    ['Obs.', W.obs],
  ];

  const drawHeaderRow = (top: number) => {
    doc.setFillColor(55, 65, 85);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.45);
    let cx = margin;
    for (const [label, w] of headerLabels) {
      doc.rect(cx, top, w, headerH, 'FD');
      // jsPDF puede volver a color de texto negro al cerrar el path del rect;
      // sin reafirmar blanco, las etiquetas quedan ilegibles sobre el fondo oscuro.
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      const pad = 1.2;
      doc.text(label, cx + pad, top + 6, { maxWidth: Math.max(2, w - pad * 2) });
      cx += w;
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    return top + headerH;
  };

  const drawStudentDataRow = (
    top: number,
    rowIndex: number,
    nm: string,
    dni: string,
    ext: string,
  ) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    let cx = margin;
    doc.rect(cx, top, W.num, rowH, 'S');
    doc.text(String(rowIndex), cx + 1.5, top + 5.2);
    cx += W.num;
    doc.rect(cx, top, W.name, rowH, 'S');
    doc.text(nm, cx + 1, top + 5.2, { maxWidth: W.name - 2 });
    cx += W.name;
    doc.rect(cx, top, W.dni, rowH, 'S');
    doc.text(dni, cx + 1, top + 5.2, { maxWidth: W.dni - 2 });
    cx += W.dni;
    doc.rect(cx, top, W.id, rowH, 'S');
    doc.text(ext, cx + 1, top + 5.2, { maxWidth: W.id - 2 });
    cx += W.id;
    doc.rect(cx, top, W.p, rowH, 'S');
    cx += W.p;
    doc.rect(cx, top, W.a, rowH, 'S');
    cx += W.a;
    doc.rect(cx, top, W.j, rowH, 'S');
    cx += W.j;
    doc.rect(cx, top, W.firma, rowH, 'S');
    cx += W.firma;
    doc.rect(cx, top, W.obs, rowH, 'S');
    return top + rowH;
  };

  y = drawHeaderRow(y);

  const studentLabel = (s: SessionStudentRow, i: number) => {
    const ext = s.student_external_id != null ? String(s.student_external_id) : '';
    const nm =
      s.student_name != null && String(s.student_name).trim() !== ''
        ? String(s.student_name).trim()
        : ext
          ? `Alumno ${ext}`
          : `Alumno ${i + 1}`;
    return { nm, ext: ext || '—', dni: pickStudentDni(s) };
  };

  list.forEach((s, i) => {
    if (y + rowH > pageBottom) {
      doc.addPage();
      y = 18;
      y = drawHeaderRow(y);
    }
    const { nm, ext, dni } = studentLabel(s, i);
    y = drawStudentDataRow(y, i + 1, nm, dni, ext);
  });

  const manualBlockH = 6 + headerH + MANUAL_EXTRA_ROWS * rowH + 4;
  if (y + manualBlockH > pageBottom) {
    doc.addPage();
    y = 18;
  } else {
    y += 6;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Alumnos no incluidos en la lista del sistema (completar a mano, máx. ${MANUAL_EXTRA_ROWS})`,
    margin,
    y,
  );
  y += 6;
  y = drawHeaderRow(y);

  const baseNum = list.length;
  for (let k = 0; k < MANUAL_EXTRA_ROWS; k++) {
    if (y + rowH > pageBottom) {
      doc.addPage();
      y = 18;
      y = drawHeaderRow(y);
    }
    y = drawStudentDataRow(y, baseNum + k + 1, '', '', '');
  }

  y += 8;
  if (y + 22 > pageBottom) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total alumnos en sistema: ${list.length} (+ ${MANUAL_EXTRA_ROWS} filas manuales)`, margin, y);
  y += 7;
  doc.text('Firma del docente: ________________', margin, y);
  y += 7;
  const genAt = new Date().toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Generado por Atendee · ${genAt} · Lista ${listId}`, margin, y);

  doc.save(`lista-asistencia-${session.date}.pdf`);
}
