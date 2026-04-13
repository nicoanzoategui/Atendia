# Atendee — Spec completo

## Stack
- **Backend**: NestJS, puerto 5001, Supabase (PostgreSQL)
- **Frontend**: Next.js 16, puerto 5050, PWA offline-first
- **Auth**: JWT propio (no Supabase Auth)
- **DB local**: IndexedDB (pending-attendance-store, session-cache-store)

## Roles
- `admin` → gestión de cursos, clases, historial
- `teacher` → toma asistencia, ve sus cursos y estadísticas
- `student` → ve su cursada, escanea QR, ve sus estadísticas

---

## Flujo Teacher

### Pantalla inicial: `/teacher/courses`
- Header: "Hola, [nombre del profesor]"
- **Card destacada**: próxima clase del día con fecha, nombre de clase, horario, dirección/aula → CTA "Tomar asistencia"
- **Cards de cursos**: uno por curso a cargo del docente
  - Nombre del curso (ej. "Instalación de aire acondicionado")
  - Cantidad de estudiantes inscriptos
  - CTA "Ver detalle"

### Detalle de curso: `/teacher/courses/[id]`
- Nombre del curso
- Lista de todas las fechas de clase (class_sessions)
- Cada fecha muestra: fecha, horario, estado (scheduled/open/closed/cancelled)
- CTA "Tomar asistencia" por cada clase

### Tomar asistencia: `/teacher/sessions/[id]`
**3 opciones en tabs o cards:**

#### Opción 1 — Escanear QR
- Genera QR dinámico (rotación automática con countdown visual)
- El QR se muestra grande en pantalla para que alumnos escaneen
- CTA "Cerrar asistencia" cuando el docente termina
- Estado: muestra contador de alumnos que ya escanearon

#### Opción 2 — NFC
- Placeholder por ahora ("Próximamente")

#### Opción 3 — Asistencia manual
- Barra de búsqueda por nombre o ID de alumno
- Lista completa del roster con opciones por alumno:
  - ✅ Presente
  - 🕐 Tarde
  - ❌ Ausente
  - 📋 Justificado
- Cada alumno muestra su estado actual si ya fue marcado
- Si falla la red → guardar en IndexedDB, mostrar badge "pendiente sync"

### Estadísticas: `/teacher/stats/[editionId]`
- Resumen de asistencia por alumno
- Porcentaje de asistencia, tardanzas, ausencias
- Por clase y total del curso

---

## Flujo Student

### Pantalla inicial: `/student/course`
- Muestra su curso actual
- Próxima clase con fecha, horario, aula
- CTA "Escanear QR" para registrar asistencia

### Escanear QR: `/student/scan`
- Abre cámara para escanear QR del docente
- POST `/attendance/qr` con el token escaneado
- Si falla por red → guardar en IndexedDB, mostrar "Registrado offline"
- Feedback claro: éxito ✅ / error ❌ / offline 📶

### Historial: `/student/history`
- Lista de clases con su estado de asistencia
- Resumen: presentes, tardanzas, ausencias, justificados
- Porcentaje de asistencia total

---

## Flujo Admin

### Cursos: `/admin/courses`
- Lista todos los cursos (GET /admin/courses)
- Link a detalle de cada curso

### Detalle curso: `/admin/courses/[id]`
- Lista de clases del curso (GET /admin/courses/:editionId/classes)
- Link a detalle de cada clase

### Detalle clase: `/admin/classes/[id]`
- Lista completa de alumnos con estado de asistencia
- Puede editar estado de cada alumno (PATCH /admin/classes/:classId/students/:studentId)
- Botón exportar CSV (GET /admin/classes/:classId/export)

### Historial: `/admin/history`
- Vista general de todas las clases y sus estados

---

## Endpoints del backend (puerto 5001)

```
AUTH
POST   /auth/login          → { email, password } → { access_token, user: { id, email, role, tenant_id, external_id } }
GET    /auth/me             → usuario actual

SESSIONS
GET    /sessions/today      → clases del día del docente
GET    /sessions/:id        → detalle de sesión
PATCH  /sessions/:id/open   → abrir asistencia
PATCH  /sessions/:id/close  → cerrar asistencia
PATCH  /sessions/:id/cancel → cancelar (body: { comment })
GET    /sessions/:id/students → roster con estado de asistencia

QR
POST   /qr-tokens/session/:id → genera token QR → { token, expiresAt }

ATTENDANCE
POST   /attendance/qr       → { token } → registra por QR
POST   /attendance/manual   → { sessionId, studentExternalId, status, method }
GET    /attendance/my-history → historial del estudiante actual

ADMIN
GET    /admin/courses                              → lista cursos
GET    /admin/courses/:editionId/classes           → clases del curso
GET    /admin/classes/:classId                     → detalle clase
PATCH  /admin/classes/:classId/students/:studentId → editar asistencia
GET    /admin/classes/:classId/export              → exportar CSV
GET    /admin/history                              → historial general
```

---

## Archivos existentes que NO tocar

- `src/app/layout.tsx`
- `src/app/client-layout.tsx`
- `src/lib/hooks/use-auth.ts`
- `src/lib/api/client.ts`
- `src/middleware.ts`

## Archivos existentes que SÍ usar

- `src/lib/hooks/use-qr-rotation.ts` — rotación automática del QR
- `src/lib/hooks/use-realtime-attendance.ts` — actualizaciones en tiempo real
- `src/lib/hooks/use-sync-status.ts` — estado de sync offline
- `src/lib/db/pending-attendance-store.ts` — guardar asistencias offline
- `src/lib/db/session-cache-store.ts` — cachear sesiones para offline
- `src/lib/sync/sync-manager.ts` — sync cuando vuelve la red
- `src/components/qr/qr-scanner.tsx` — scanner de QR para el alumno
- `src/components/layout/teacher-bottom-nav.tsx`
- `src/components/layout/student-bottom-nav.tsx`
- `src/components/layout/admin-bottom-nav.tsx`
- `src/components/offline/offline-banner.tsx`
- `src/components/offline/sync-indicator.tsx`

## Estados de class_session

```
scheduled        → puede abrirse
attendance_open  → tomando asistencia (QR activo)
attendance_closed → cerrada
finalized        → finalizada
cancelled        → cancelada
```

## Reglas de UI por estado

| Estado | Botón Abrir | Botón Cerrar | Botón Cancelar | QR |
|--------|-------------|--------------|----------------|----|
| scheduled | ✅ | ❌ | ✅ | ❌ |
| attendance_open | ❌ | ✅ | ✅ | ✅ |
| attendance_closed | ❌ | ❌ | ❌ | ❌ |
| finalized | ❌ | ❌ | ❌ | ❌ |
| cancelled | ❌ | ❌ | ❌ | ❌ |

## Diseño

- Mobile-first, Tailwind CSS
- Tipografía limpia, sin colores llamativos
- Cards con bordes suaves, sombras mínimas
- Estados de carga con skeleton/pulse
- Feedback claro para cada acción (éxito, error, offline)
- Bottom navigation para cada rol
