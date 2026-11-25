# Plan técnico — Alquiler audiovisual

> Propuesta de arquitectura para la especificación funcional v1. Las decisiones de stack se apoyan en la clase 1 (React y Node como stack de referencia, con libertad para elegir) y clase 5 (plan antes de código; capas, modelo de datos y API). Deben revisarse si la consigna académica posterior exige otra tecnología.

## 1. Arquitectura

- **Frontend:** React + TypeScript, aplicación web de una página.
- **Backend:** Node.js + TypeScript + Express, API REST.
- **Capas backend:** rutas/controladores para HTTP; servicios para reglas de negocio; repositorios para acceso a datos.
- **Base de datos:** PostgreSQL relacional. Se elige por transacciones, relaciones claras e integridad para inventario y reservas concurrentes.
- **Pruebas:** Vitest para unidades e integración; Supertest para endpoints HTTP; PostgreSQL de prueba para validar constraints y concurrencia. Frontend con Vitest y React Testing Library.
- **Comunicación:** JSON sobre HTTP. La API valida identidad y permisos en cada endpoint protegido. Autenticación mediante token Bearer en el encabezado `Authorization`; el token se emite al iniciar sesión y se valida con middleware en rutas protegidas.
- **Fechas:** API intercambia timestamps ISO 8601 con zona; base persiste instantes UTC; interfaz y reglas de calendario se presentan en `America/Argentina/Buenos_Aires`.

## 2. Modelo de datos propuesto

- **User:** id, nombre, email único, teléfono, organización opcional, hash de contraseña, rol, creado_en, activo.
- **EquipmentType:** id, nombre, descripción, tarifa_hora_ars, activo.
- **AssetUnit:** id, equipment_type_id, código único, estado (`available`, `maintenance`, `missing`, `retired`).
- **Reservation:** id, cliente_id, inicio, fin, estado, subtotal, total, moneda, creado_en, cancel_reason opcional.
- **ReservationLine:** id, reservation_id, equipment_type_id, cantidad, tarifa_hora_snapshot, subtotal_snapshot.
- **ReservationAllocation:** reservation_line_id, asset_unit_id; registra qué unidades físicas se asignaron.
- **MaintenanceBlock:** id, asset_unit_id, inicio, fin, motivo, administrador_id.
- **ConditionEvent:** id, reservation_id, asset_unit_id, etapa (`pickup`/`return`), condición, observación, registrado_por, registrado_en.
- **InAppNotice:** id, user_id, reservation_id opcional, tipo, mensaje, creado_en, leído_en opcional.

Las reservas usan intervalos semiabiertos `[inicio, fin)`. Crear una reserva y asignar todas sus unidades se realiza en una transacción. PostgreSQL debe impedir que una unidad tenga dos asignaciones activas que se solapen, con una exclusion constraint sobre unidad e intervalo y solo asignaciones activas. Confirmación, cancelación y expiración actualizan asignaciones dentro de transacciones. Reserva y mantenimiento bloquean primero la fila de la unidad y comprueban conflictos bajo la misma transacción para evitar carreras entre operaciones.

## 3. API inicial

| Método y ruta | Rol | Uso |
|---|---|---|
| `POST /api/auth/register` | Público | Crear cuenta cliente |
| `POST /api/auth/login` | Público | Iniciar sesión |
| `POST /api/auth/logout` | Cliente/admin | Cerrar sesión |
| `GET /api/equipment-types` | Público | Consultar catálogo activo |
| `GET /api/availability` | Público | Consultar modelo, cantidad e intervalo |
| `POST /api/reservations` | Cliente | Cotizar y confirmar reserva |
| `GET /api/reservations/mine` | Cliente | Ver reservas propias |
| `POST /api/reservations/:id/cancel` | Cliente/admin | Cancelar si las reglas lo permiten |
| `GET /api/admin/equipment-types` / `POST /api/admin/equipment-types` / `PATCH /api/admin/equipment-types/:id` | Admin | Consultar y gestionar modelos/tarifas |
| `POST /api/admin/units` / `PATCH /api/admin/units/:id` | Admin | Crear/actualizar unidades físicas y estado |
| `POST /api/admin/maintenance-blocks` | Admin | Bloquear unidad por mantenimiento |
| `POST /api/admin/reservations/:id/pickup` | Admin | Registrar entrega/condición inicial |
| `POST /api/admin/reservations/:id/return` | Admin | Registrar devolución/incidencias |
| `POST /api/admin/reservations/:id/cancel` | Admin | Cancelar reserva operativa con motivo |
| `GET /api/admin/operations` | Admin | Consultar reservas, bloqueos y demoras |

Respuesta de error de negocio: status HTTP adecuado y objeto con código estable y mensaje legible. Las rutas administrativas requieren rol admin. La API no tendrá rutas de pago externo ni notificación externa.

## 4. Ubicación de las reglas

- **Servicios:** ventanas de reserva, duración, tarifa/cotización, cancelación, transición de estados, mantenimiento, demoras e incidencias (RN-03 a RN-10, RN-12 a RN-25).
- **PostgreSQL/transacción:** unicidad de email/código de unidad, referencias, consistencia de intervalos y prevención final de solapamiento; asignación atómica completa (RN-01 a RN-11).
- **Middleware/controladores:** autenticación, rol y validación de forma de entrada; no contienen cálculos de negocio.
- **Frontend:** presentación y validación de conveniencia únicamente. Nunca decide disponibilidad o precio final.

## 5. Riesgos y puntos a validar

- La exclusion constraint de PostgreSQL necesita extensión `btree_gist` y diseño de cómo representar asignaciones activas; validar en una prueba de integración temprana.
- Las cancelaciones administrativas y reservas futuras afectadas por demoras necesitan conservar historial y avisos dentro del sistema.
- El token debe tener expiración y secreto cargado desde variables de entorno; no incluir tokens ni secretos en respuestas o repositorio.
- Las clases no imponen framework ni proveedor. PA-17 quedó resuelta; la entrega online está exigida por la clase 10.

## 6. Publicación académica

La entrega debe poder probarse online e incluir frontend, backend y base de datos. Como propuesta basada en los ejemplos de clase 10, evaluar Netlify para frontend, Render para backend y Neon para PostgreSQL; no son requisitos y sus planes/limitaciones se verificarán al desplegar. Configurar URL de base, secreto del token y demás credenciales solo como variables de entorno del proveedor. Nunca subir `.env` ni valores reales; versionar únicamente `.env.example`.

El stack es una propuesta elegida para el proyecto, no un requerimiento obligatorio de la docente.

