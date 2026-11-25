# Plan técnico — Alquiler audiovisual

> Plan de arquitectura revisado contra `Docs/spec.md`, `Docs/decisiones.md` y `Docs/glosario.md`. Describe cómo implementar las reglas; no agrega comportamiento de negocio. El stack es una decisión de diseño, no un requisito del curso.

## 1. Arquitectura y capas

- **Frontend:** React + TypeScript. Presenta el catálogo, consulta disponibilidad, envía acciones y muestra respuestas. No determina tarifa final, disponibilidad ni permisos.
- **Backend:** Node.js + TypeScript + Express, API REST JSON.
- **Rutas:** método, path, parsing de parámetros/body y montaje de middleware. Sin cálculos de negocio.
- **Controllers:** validación de forma de entrada y traducción resultado/error a HTTP; delegan al service.
- **Services:** reglas RN, transacciones, autorización contextual, cálculo de cotizaciones y transiciones operativas.
- **Repositories:** SQL parametrizado y mapeo de filas; no deciden reglas.
- **Infraestructura:** PostgreSQL, migraciones, reloj, hasher de contraseña, emisor/validador de tokens y configuración por variables de entorno.
- **Pruebas:** Vitest; Supertest para API; PostgreSQL de prueba para migraciones, constraints y concurrencia; Vitest + React Testing Library para interfaz.

## 2. Modelo de datos relacional

Todos los identificadores son `UUID`, generados por backend/DB. Instantes son `TIMESTAMPTZ`; precios `NUMERIC(12,2)`. Las FK son restrictivas salvo las relaciones de datos dependientes expresamente indicadas. Reglas sobre intervalos usan rangos semiabiertos `[inicio, fin)`.

Enums PostgreSQL: `user_role(client, admin)`, `asset_status(available, maintenance, missing, retired)`, `reservation_status(confirmed, delivered, returned, cancelled, expired)`, `condition_stage(pickup, return)` y `condition_value(correct, damaged, missing)`. Las filas de negocio se conservan para auditoría; no hay borrados en cascada de reservas, unidades o eventos.

### User
- `id UUID PK`; `full_name VARCHAR(120) NOT NULL`; `email VARCHAR(254) NOT NULL`; `email_normalized VARCHAR(254) UNIQUE NOT NULL`; `phone VARCHAR(32) NOT NULL`; `organization VARCHAR(160) NULL`.
- `password_hash TEXT NOT NULL`; `role user_role NOT NULL` (`client`, `admin`); `is_active BOOLEAN NOT NULL DEFAULT TRUE`; `created_at TIMESTAMPTZ NOT NULL`.
- Una persona puede tener cero o más `AuthSession`; un cliente puede tener cero o más reservas. El administrador se provisiona fuera del registro público.

### AuthSession
- `id UUID PK`; `user_id UUID FK -> User NOT NULL`; `token_id UUID UNIQUE NOT NULL` (claim `jti`); `created_at TIMESTAMPTZ NOT NULL`; `expires_at TIMESTAMPTZ NOT NULL`; `revoked_at TIMESTAMPTZ NULL`.
- Login emite JWT Bearer firmado con HS256 y `ACCESS_TOKEN_SECRET` de entorno; vigencia inicial de 8 horas, configurable con `ACCESS_TOKEN_TTL`. El middleware valida firma, algoritmo permitido, expiración, `jti`, sesión no revocada y usuario activo. Logout revoca el `jti`. Las contraseñas usan Argon2id; nunca se almacena o devuelve la contraseña/hash. El secreto no se registra en logs.

### EquipmentType
- `id UUID PK`; `name VARCHAR(120) NOT NULL`; `description TEXT NOT NULL`; `hourly_rate_ars NUMERIC(12,2) NULL CHECK (hourly_rate_ars IS NULL OR hourly_rate_ars >= 0)`; `is_active BOOLEAN NOT NULL DEFAULT TRUE`; `created_at TIMESTAMPTZ NOT NULL`.
- `hourly_rate_ars` null o `is_active=false` significa que no puede ofrecerse ni reservarse (RN-01/RN-14). Un tipo tiene muchas `AssetUnit` y `ReservationLine`.

### AssetUnit
- `id UUID PK`; `equipment_type_id UUID FK -> EquipmentType NOT NULL`; `code VARCHAR(80) UNIQUE NOT NULL`; `status asset_status NOT NULL` (`available`, `maintenance`, `missing`, `retired`); `created_at TIMESTAMPTZ NOT NULL`.
- Estado `maintenance` es no alquilable hasta cambio administrativo. Una unidad disponible puede tener varios bloqueos programados no solapados y asignaciones históricas no activas.

### Reservation
- `id UUID PK`; `client_id UUID FK -> User NOT NULL`; `starts_at TIMESTAMPTZ NOT NULL`; `ends_at TIMESTAMPTZ NOT NULL`; `status reservation_status NOT NULL` (`confirmed`, `delivered`, `returned`, `cancelled`, `expired`).
- `total_ars NUMERIC(12,2) NOT NULL`; `currency CHAR(3) NOT NULL DEFAULT 'ARS'`; `created_at TIMESTAMPTZ NOT NULL`; `delivered_at TIMESTAMPTZ NULL`; `returned_at TIMESTAMPTZ NULL`; `cancelled_at TIMESTAMPTZ NULL`; `cancelled_by UUID FK -> User NULL`; `cancel_reason TEXT NULL`.
- `CHECK (ends_at > starts_at)`; `CHECK (total_ars >= 0)`; `CHECK (returned_at IS NULL OR delivered_at IS NOT NULL)`. No se duplica un subtotal de cabecera: el único importe final persistido es `total_ars`, derivado de las líneas.
- Una reserva tiene una o más líneas; cada línea refiere a un tipo de equipo y sus asignaciones físicas. `status=delivered` conserva las unidades bajo custodia hasta devolución/incidencia; la demora se deriva comparando `ends_at` con `Clock`.

### ReservationLine
- `id UUID PK`; `reservation_id UUID FK -> Reservation NOT NULL`; `equipment_type_id UUID FK -> EquipmentType NOT NULL`; `quantity INTEGER NOT NULL CHECK (quantity > 0)`.
- `hourly_rate_snapshot NUMERIC(12,2) NOT NULL`. El subtotal se reproduce con tarifa, cantidad e intervalo común; no se persiste una aproximación decimal por línea.
- La cantidad de asignaciones físicas de cada línea debe coincidir con `quantity`; se valida en la misma transacción que confirma la reserva, ya que es una agregación entre tablas.

### ReservationAllocation
- `id UUID PK`; `reservation_line_id UUID FK -> ReservationLine NOT NULL`; `asset_unit_id UUID FK -> AssetUnit NOT NULL`; `occupied_period TSTZRANGE NOT NULL`; `assigned_at TIMESTAMPTZ NOT NULL`; `released_at TIMESTAMPTZ NULL`; `picked_up_at TIMESTAMPTZ NULL`; `custody_ended_at TIMESTAMPTZ NULL`.
- Índice único parcial `UNIQUE (reservation_line_id, asset_unit_id) WHERE released_at IS NULL` evita asignar dos veces una unidad en la misma línea y permite conservar/recrear asignaciones históricas. Otro índice único parcial `UNIQUE (asset_unit_id) WHERE picked_up_at IS NOT NULL AND custody_ended_at IS NULL` impide dos custodias físicas abiertas para una unidad.
- La transacción comprueba que el tipo de `AssetUnit` coincida con el de su `ReservationLine`; el conteo por línea debe ser exactamente `quantity`.
- Al confirmar, el service copia exactamente `[Reservation.starts_at, Reservation.ends_at)` a cada asignación. La operación solo escribe el rango desde el service y no permite editar fechas de reserva confirmada.
- `CHECK (NOT isempty(occupied_period) AND lower_inc(occupied_period) AND NOT upper_inc(occupied_period))`; verificar límite inferior incluido/superior excluido. Activar `btree_gist` y crear `EXCLUDE USING gist (asset_unit_id WITH =, occupied_period WITH &&) WHERE (released_at IS NULL)`. Esta constraint impide solapamientos de asignaciones planificadas por unidad incluso bajo concurrencia.
- Cancelar, expirar por no retiro o cerrar una devolución marca `released_at` dentro de una transacción. Retiro establece `picked_up_at`; recepción o registro de faltante cierra la custodia con `custody_ended_at`. Se conserva la fila como historial.
- Si una reserva entregada supera `ends_at` sin cerrar custodia, el service la detecta con `Clock`, mantiene la unidad indisponible y cruza su asignación abierta con las asignaciones futuras para reportar el conflicto RN-21. Al reservar o consultar disponibilidad, se bloquea cada unidad candidata con `FOR UPDATE` y también se verifica custodia vencida; por eso el control cubre la ocupación real que excede el rango programado. La admin debe reasignar/cancelar futuros afectados antes de nuevas asignaciones. No se extiende el rango GiST sobre asignaciones futuras incompatibles.

### MaintenanceBlock
- `id UUID PK`; `asset_unit_id UUID FK -> AssetUnit NOT NULL`; `starts_at TIMESTAMPTZ NOT NULL`; `ends_at TIMESTAMPTZ NOT NULL`; `reason TEXT NOT NULL`; `admin_id UUID FK -> User NOT NULL`; `created_at TIMESTAMPTZ NOT NULL`; `cancelled_at TIMESTAMPTZ NULL`.
- `CHECK (ends_at > starts_at)`. Índice GiST implementable `USING gist (asset_unit_id, tstzrange(starts_at, ends_at, '[)')) WHERE cancelled_at IS NULL` (con `btree_gist`) para consultar solapamientos. El service bloquea la fila AssetUnit, valida que no haya ReservationAllocation activa ni custodia abierta que se solape y crea/cancela el bloqueo bajo la misma transacción. Los bloqueos cancelados se conservan para auditoría.

### AllocationChangeEvent
- `id UUID PK`; `reservation_id UUID FK -> Reservation NOT NULL`; `old_allocation_id UUID FK -> ReservationAllocation NOT NULL`; `new_allocation_id UUID FK -> ReservationAllocation NOT NULL`; `admin_id UUID FK -> User NOT NULL`; `reason TEXT NOT NULL`; `created_at TIMESTAMPTZ NOT NULL`.
- Evento inmutable obligatorio al reasignar unidad (RN-09/RN-21), con ambas asignaciones y motivo para auditoría. Cancelaciones administrativas guardan el motivo en `Reservation.cancel_reason`.

### ConditionEvent
- `id UUID PK`; `operation_id UUID NOT NULL` (agrupa las condiciones de una misma operación); `reservation_id UUID FK -> Reservation NOT NULL`; `asset_unit_id UUID FK -> AssetUnit NOT NULL`; `stage condition_stage NOT NULL` (`pickup`, `return`); `condition condition_value NOT NULL` (`correct`, `damaged`, `missing`); `note TEXT NULL`; `admin_id UUID FK -> User NOT NULL`; `recorded_at TIMESTAMPTZ NOT NULL`.
- Evento inmutable de historial; daño deja la unidad en `maintenance`, faltante en `missing` y ambas fuera de disponibilidad hasta decisión administrativa.
- No se impone unicidad por reserva/unidad/etapa: cada intento de retiro, incluso uno bloqueado por daño/faltante, se conserva para auditoría y puede repetirse después de resolver la incidencia.

### InAppNotice
- `id UUID PK`; `user_id UUID FK -> User NOT NULL`; `reservation_id UUID FK -> Reservation NULL`; `kind VARCHAR(40) NOT NULL`; `message TEXT NOT NULL`; `created_at TIMESTAMPTZ NOT NULL`; `read_at TIMESTAMPTZ NULL`.
- Se usa para confirmaciones, cancelaciones y conflictos operativos. No dispara correo ni mensajería externa.

### Constraints, transacciones y concurrencia
- `email_normalized` se construye en backend como trim + lowercase; unicidad validada por índice único.
- Los servicios de reserva, disponibilidad y mantenimiento toman `FOR UPDATE` sobre las unidades candidatas en orden ascendente de UUID y revalidan estado, bloqueos, asignaciones y custodia después de obtener los locks; así los cambios concurrentes se observan antes de escribir.
- Reservar: en una transacción, bloquear unidades candidatas con `SELECT ... FOR UPDATE`, comprobar estado, bloques y disponibilidad suficiente, calcular snapshots y crear reserva/líneas/asignaciones. La exclusion constraint arbitra la última carrera concurrente; conflicto se traduce a “no disponible” sin datos parciales.
- Mantenimiento: toma el mismo lock de la unidad y comprueba asignaciones activas y custodia abierta. Una reserva futura que ya exista impide el bloqueo hasta reasignación o cancelación.
- Cualquier cancelación/reasignación/devolución/expiración actualiza estado, asignaciones, eventos y avisos en una transacción.
- La vencida se evalúa con el reloj del sistema antes de consultas de disponibilidad/reserva y en operaciones administrativas. Al pasar `starts_at` sin entrega, el service la marca `expired` y libera asignaciones. No se requiere un scheduler separado para consistencia de las rutas.
- Retiro correcto bloquea las filas de asignación, guarda `Reservation.delivered_at` y `picked_up_at`, y registra las condiciones en una transacción. Si detecta unidades dañadas o ausentes, registra las incidencias y los estados de inventario, deja la reserva `confirmed` y no inicia custodia de ninguna unidad; el administrador luego repara/habilita, reasigna o cancela. Devolución correcta/faltante registra `returned_at`, `custody_ended_at` y `released_at` por asignación, cierra la reserva y notifica en cuenta.
- El controlador de daño/faltante en retiro es un resultado `409` con cambios de inventario e incidencia confirmados en DB: el service devuelve un resultado de dominio que el controller convierte a HTTP después del commit, no lanza excepción dentro de la transacción.

## 3. Contratos de API

Todas las respuestas son JSON salvo `204`; errores siguen `{ "error": { "code": "...", "message": "..." } }`. Los importes monetarios se serializan como strings decimales, no números JSON binarios. El servidor calcula precios y disponibilidad; cualquier precio enviado por cliente se ignora o rechaza. Toda ruta privada usa `requireAuth` (Bearer JWT validado y sesión activa); rutas administrativas agregan `requireRole('admin')`; rutas con recursos de cliente verifican propiedad. Ninguna respuesta incluye contraseña, hash ni secreto de token.

| Método y ruta | Rol | Propósito | Entrada principal | Respuesta/errores esperados |
|---|---|---|---|---|
| `POST /api/auth/register` | Público | Crear cuenta cliente | nombre, email, teléfono, password, organización opcional; el rol siempre es `client` y no se acepta desde el body | `201` perfil público; `409` email duplicado; `400` formato inválido |
| `POST /api/auth/login` | Público | Iniciar sesión | email, password | `200` Bearer JWT con expiración y perfil mínimo; `401` credenciales inválidas |
| `POST /api/auth/logout` | Cliente/Admin | Revocar sesión actual | Bearer actual | `204`; `401` token inválido/revocado |
| `GET /api/equipment-types` | Público | Consultar catálogo | filtros opcionales | `200` tipos activos y tarifa vigente; sin datos privados de unidades |
| `GET /api/availability` | Público | Consultar cantidad disponible | `equipmentTypeId`, `quantity`, `startsAt`, `endsAt` | `200 {requestedQuantity, availableQuantity, isAvailable}`; `400` intervalo/cantidad inválidos; no reserva inventario |
| `POST /api/quotes` | Público | Cotizar sin reservar | fechas y líneas `{equipmentTypeId, quantity}` | `200 {currency, total: string, lines[{equipmentTypeId, quantity, hourlyRate: string}]}` calculado en servidor; `400` intervalo; `409` tipo sin tarifa |
| `POST /api/reservations` | Cliente | Confirmar reserva atómica | fechas y líneas `{equipmentTypeId, quantity}` | `201 {id, status, startsAt, endsAt, total: string, currency}`; `409` inventario/tarifa; sin parcial |
| `GET /api/reservations/mine` | Cliente | Listar reservas propias | filtros de estado/período opcionales | `200` resumen de reservas del usuario autenticado |
| `GET /api/reservations/:id` | Dueño Cliente/Admin | Consultar estado y detalle | id | `200` reserva con fechas, líneas, total y estado; `404` inexistente o ajena |
| `POST /api/reservations/:id/cancel` | Dueño Cliente/Admin | Cancelar reserva según RN-17/18 | motivo obligatorio solo para Admin | `200` cancelada; `404` ajena/no visible; `409` transición no permitida |
| `GET /api/admin/equipment-types` | Admin | Listar catálogo administrativo | ninguno | `200` tipos activos e inactivos con tarifas |
| `POST /api/admin/equipment-types` | Admin | Crear tipo/modelo | nombre, descripción, tarifa opcional, activo | `201`; `400` validación |
| `PATCH /api/admin/equipment-types/:id` | Admin | Editar tipo/tarifa | campos editables | `200`; las reservas conservan snapshot; `404` no existe |
| `GET /api/admin/units` | Admin | Listar unidades y estados | filtro por tipo/estado | `200` unidades administrativas |
| `POST /api/admin/units` | Admin | Crear unidad física | equipmentTypeId, code, status | `201`; `409` código duplicado; `404` tipo no existe |
| `PATCH /api/admin/units/:id` | Admin | Cambiar estado general de unidad | estado permitido | `200`; `409` si la unidad tiene custodia física abierta; una asignación futura afectada queda visible para reasignar/cancelar; `404` no existe |
| `POST /api/admin/maintenance-blocks` | Admin | Bloquear intervalo de unidad | assetUnitId, startsAt, endsAt, reason | `201`; `409` asignación confirmada/custodia que se solapa |
| `DELETE /api/admin/maintenance-blocks/:id` | Admin | Cancelar bloqueo futuro | ninguno | `204`; `404` no existe; no borra auditoría |
| `GET /api/admin/maintenance-blocks` | Admin | Consultar bloqueos | período/unidad opcionales | `200` bloqueos activos e históricos con sus IDs |
| `POST /api/admin/reservations/:id/pickup` | Admin | Registrar retiro completo | condición y nota por cada asignación | `200` entregada si todas están correctas; `409` estado inválido; si daño/faltante, registra incidencia/estado, no entrega ninguna y conserva reserva confirmada para reparación/habilitación, reasignación o cancelación |
| `POST /api/admin/reservations/:id/return` | Admin | Registrar devolución/incidencias | condición por asignación: `correct`, `damaged` o `missing` + nota | `200` devuelta al cerrar cada asignación; crea eventos y avisos; `409` estado inválido |
| `POST /api/admin/reservations/:id/reassign` | Admin | Resolver falta de unidad o demora en una reserva futura aún no entregada | allocationId, replacementUnitId y motivo obligatorio | `200` cambio transaccional y aviso al cliente afectado; `409` reserva ya entregada/unidad ocupada o incompatible; registra AllocationChangeEvent |
| `GET /api/admin/reservations` | Admin | Consultar reservas operativas | período/estado opcionales | `200` reservas, custodias abiertas y demoras derivadas |
| `GET /api/admin/operations` | Admin | Consultar resumen operativo | período opcional | `200` reservas, disponibilidad, bloqueos y demoras |
| `GET /api/notices` | Cliente/Admin | Consultar avisos en cuenta | ninguno | `200` avisos solo del usuario autenticado |
| `POST /api/notices/:id/read` | Dueño Cliente/Admin | Marcar aviso leído | id | `204`; `404` ajeno/no visible |

`401` token ausente, inválido, expirado o revocado; `403` identidad autenticada sin rol/permisos; `404` recurso inexistente o no visible para el usuario; `409` conflicto de estado o inventario; `400` formato o validación de entrada. `500` solo para fallos inesperados, sin detalles internos.

## 4. Ubicación de reglas y trazabilidad

| Reglas | Componente principal | Datos/API relacionados |
|---|---|---|
| RN-01, RN-14 | EquipmentTypeService/Repository | EquipmentType; catálogo y admin equipment-types |
| RN-02 | AssetUnitService | AssetUnit.status; catálogo de disponibilidad |
| RN-03–RN-06 | ReservationService + Clock + DB checks | Reservation starts/ends; disponibilidad y POST reservations |
| RN-07–RN-08, RN-10 | Availability/ReservationService + transacción | ReservationLine, Allocation; GET availability, POST reservations |
| RN-09 | MaintenanceService + lock/consulta transaccional | MaintenanceBlock/Allocation; POST maintenance |
| RN-11 | Transaction + exclusion constraint | Allocation.occupied_period; POST reservations |
| RN-12–RN-13 | ReservationLifecycleService + Clock | Reservation.status, Allocation.released_at; pickup, return, booking/admin reads |
| RN-15–RN-16 | PricingService + ReservationRepository | tarifas snapshots y total; POST reservations |
| RN-17–RN-18 | CancellationService | status, motivo, Allocation release, InAppNotice; cancel routes |
| RN-19–RN-20 | Fulfillment/ConditionService | Reservation, ConditionEvent, AssetUnit; pickup/return |
| RN-21, RN-24 | Delay/Reassignment/Notice services | Allocation, Reservation, InAppNotice; reassign, operations/notices |
| RN-22–RN-23 | AuthService + middleware | User/AuthSession; register/login/logout |
| RN-25 | OperationsQueryService | Reservation/Unit/Block; admin operations |

El mapeo se aplica a cada regla dentro del rango indicado: fechas y disponibilidad usan además `Clock`; cualquier operación de escritura que compita por inventario bloquea las mismas filas `AssetUnit` en orden ascendente de UUID antes de consultar o modificar asignaciones. `RN-19/RN-20` incorpora el resultado excepcional de retiro completo de `D-29`.

| Historia | Componentes y datos | Contratos API principales |
|---|---|---|
| HU-01 Catálogo | EquipmentTypeService/Repository; EquipmentType | `GET /api/equipment-types` |
| HU-02 Disponibilidad | AvailabilityService; AssetUnit, ReservationAllocation, MaintenanceBlock, Clock | `GET /api/availability` |
| HU-03 Crear reserva/cotizar | PricingService + ReservationService; Reservation, ReservationLine, Allocation | `POST /api/quotes`, `POST /api/reservations` |
| HU-04 Concurrencia | transacción + locks + exclusion constraint; ReservationAllocation | `POST /api/reservations` |
| HU-05 Cancelar | CancellationService; Reservation, Allocation, InAppNotice | `POST /api/reservations/:id/cancel` |
| HU-06 Administrar inventario | EquipmentTypeService, AssetUnitService, MaintenanceService; EquipmentType, AssetUnit, MaintenanceBlock | `/api/admin/equipment-types`, `/api/admin/units`, `/api/admin/maintenance-blocks` |
| HU-07 Entrega/devolución | FulfillmentService; Reservation, Allocation, ConditionEvent, AssetUnit | `/api/admin/reservations/:id/pickup`, `/return`, `/reassign` |
| HU-08 Vencimiento/demora | ReservationLifecycleService + Clock + ReassignmentService; Reservation, Allocation, AllocationChangeEvent | `/api/admin/reservations`, `/operations`, `/reassign`, `/cancel` |
| HU-09 Consulta de operación | OperationsQueryService; Reservation, AssetUnit, MaintenanceBlock | `GET /api/admin/operations`, `GET /api/admin/reservations` |

El frontend llama esos contratos y presenta resultados/errores; nunca reemplaza reglas del servidor.

## 5. Reloj, fechas y autenticación para pruebas

- `Clock` es una interfaz inyectada en servicios. `SystemClock` entrega el instante actual; `FixedClock` de tests permite fijar y avanzar el tiempo sin esperar.
- El backend guarda instantes UTC y exige ISO-8601 con `Z` o desplazamiento explícito en APIs. La regla de calendario/presentación interpreta `America/Argentina/Buenos_Aires` usando base IANA, nunca sumando/restando `-03:00` a mano.
- Casos de prueba: cambio de día UTC vs Buenos Aires; retiro a futuro, exactamente ahora y pasado; fin igual a inicio (adyacente); fin anterior a inicio; duración 1h/336h y sobre límites; expiración por no retiro; cancelar justo antes y justo al retiro.
- Casos de integración de reglas: concurrencia de dos reservas para la última unidad; transacción multínea sin reserva parcial; constraint GiST para intervalos superpuestos y adyacentes; mantenimiento concurrente con reserva; unidad con custodia demorada y reserva futura afectada; reasignación con motivo; retiro dañado/ausente que registra incidencia pero no entrega ninguna unidad; devolución completa/faltante.
- Casos monetarios: cotización de varias líneas, tarifa modificada después de confirmar y fracciones de centavo para probar suma antes de redondear; usar aritmética racional de enteros/`BigInt`, nunca `number` binario.
- Auth tests cubren token ausente, firma/algoritmo inválidos, expirado, `jti` revocado, usuario inactivo, rol insuficiente, logout, registro que siempre asigna rol cliente, Argon2id y que hash/secreto no aparezcan en responses.

## 6. Riesgos y decisiones técnicas

- `btree_gist` debe habilitarse en migración antes de crear la exclusion constraint. PostgreSQL documenta las exclusiones sobre rangos y el operador GiST para UUID en su [guía de rangos](https://www.postgresql.org/docs/18/rangetypes.html) y la [extensión `btree_gist`](https://www.postgresql.org/docs/18/btree-gist.html). La cuenta de migraciones del proveedor debe tener permiso `CREATE` para instalar la extensión; verificarlo al elegir hosting y probarlo en PostgreSQL real, no solo mocks.
- `occupied_period` duplica el período de Reservation para hacer posible una constraint GiST en una misma tabla. Solo el service escribe las asignaciones; la transacción debe copiar exactamente los límites de la reserva. No se ofrece editar fechas confirmadas en la API.
- La exclusion constraint protege los intervalos planificados. La custodia real posterior al vencimiento se guarda separadamente en `picked_up_at/custody_ended_at`; servicios de disponibilidad/reserva bloquean la fila de unidad y consultan custodias abiertas vencidas. Operaciones administrativas resuelven reservas futuras afectadas, en línea con RN-21.
- Para el total exacto, convertir tarifa a centavos enteros y duración a microsegundos enteros; cada línea aporta el numerador `tarifa_centavos × cantidad × duración_microsegundos`, con denominador común `3 600 000 000` (microsegundos por hora). Sumar numeradores y redondear el resultado racional a centavos una sola vez, mitad hacia arriba, antes de persistir `total_ars`. No se persisten subtotales aproximados ni se usa aritmética binaria `number`.
- Las reasignaciones y demoras preservan Allocations y ConditionEvents históricos; no borrar datos operativos.
- JWT Bearer se firma con secreto de entorno dedicado y algoritmo fijado; contraseñas con Argon2id; secretos, URL de DB y demás credenciales solo en entorno. `.env` ignorado, `.env.example` sin secretos reales.
- La vigencia inicial de JWT de 8 horas es una opción técnica simple: no se persiste sesión larga de refresh y, al expirar, el usuario vuelve a iniciar sesión.
- El plan no incluye pagos, integración externa ni envíos. El proveedor de publicación queda según la tarea final y disponibilidad del curso.

## 7. Publicación académica

La entrega exige frontend, backend y base conectados y accesibles online, repositorio público, README e informe de plan/pruebas (clase 10). Netlify, Render y Neon son opciones mencionadas como ejemplo, no obligación. Variables de entorno se configuran en proveedor; no subir secretos.

## 8. Matriz de auditoría

El revisor debe comprobar cada RN/HU contra las secciones 2–5; que no haya campo, ruta o conducta que contradiga el spec; que la exclusion constraint esté definida en una sola tabla implementable; que las rutas cubran acciones de cliente y administración con autenticación/propiedad; que sesiones y credenciales correspondan a D-25; que la condición de retiro D-29 y las custodias demoradas RN-21 sean implementables; que reglas de cancelación, expiración, devolución y reasignación liberen asignaciones consistentemente; y que las sumas/fechas tengan pruebas propuestas. Veredicto final APROBADO/RECHAZADO con evidencia. Durante esta pasada no edita el plan: envía hallazgos al arquitecto; asuntos de negocio vuelven al analista.
