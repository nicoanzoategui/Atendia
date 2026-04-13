# External Classes Contract

Contrato temporal para nutrir `class_session` desde un sistema externo mientras la integracion definitiva todavia no esta operativa.

## Auth

- Header: `x-api-key`
- La API key identifica al tenant.

## Create class

`POST /api/v1/classes`

```json
{
  "external_id": "SOFIA-AIR-26A-0001",
  "name": "Instalacion de aire acondicionado",
  "subject": "Aire acondicionado",
  "modality": "in_person",
  "date": "2026-04-10",
  "start_time": "18:00",
  "end_time": "21:00",
  "location_campus": "Av. Medrano 444",
  "location_building": "Sede Principal",
  "location_classroom": "Aula 201",
  "location_floor": "1",
  "status": "scheduled",
  "metadata_jsonb": {
    "source": "sofia"
  }
}
```

## Patch class

`PATCH /api/v1/classes/:external_id`

Payload parcial:

```json
{
  "status": "cancelled",
  "location_classroom": "Aula 204"
}
```

## Replace roster

`PUT /api/v1/classes/:external_id/students`

```json
{
  "students": [
    {
      "student_external_id": "S-001",
      "student_name": "Student One"
    },
    {
      "student_external_id": "S-002",
      "student_name": "Student Two"
    }
  ]
}
```

## Notas

- `external_id` es la clave de idempotencia por tenant.
- `attendance_record` no se crea ni se modifica desde esta API.
- Mientras el sistema externo real no este listo, el seed `004_seed_external_style_classes.sql` deja datos mock con este shape.
