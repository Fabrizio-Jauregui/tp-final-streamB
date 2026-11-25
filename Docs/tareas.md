# Tareas — Alquiler audiovisual

> Derivadas de Docs/spec.md y Docs/plan.md. Los identificadores nombran las tareas; el orden de implementación lo determinan las dependencias, no la numeración de las HU. Todas están pendientes. Una tarea solo se marca hecha cuando sus pruebas pasan y el revisor la aprueba.

## Etapa 1 — Base backend y persistencia

### T-01 — Base backend, pruebas y endpoint de salud
- **Agente:** tester + backend.
- **Trabajo:** preparar Node.js/TypeScript/Express, Vitest/Supertest, scripts y una ruta de salud. El tester establece primero la prueba HTTP; luego backend implementa la ruta.
- **Cubre RN:** ninguna directamente; infraestructura.
- **Cubre HU:** ninguna directamente.
- **Depende de:** ninguna.
- **Terminada cuando:** la prueba de salud falla por ruta ausente y pasa después de implementarla; el servidor inicia con los scripts documentados.
- **Estado:** pendiente.

### T-02 — PostgreSQL de prueba y ciclo de migraciones
- **Agente:** tester + backend.
- **Trabajo:** configurar la base PostgreSQL de prueba y el ejecutor de migraciones con rollback, sin depender de la base local de desarrollo.
- **Cubre RN:** ninguna directamente; infraestructura de persistencia.
- **Cubre HU:** ninguna directamente.
- **Depende de:** T-01.
- **Terminada cuando:** una prueba de integración conecta, aplica una migración de prueba y la revierte correctamente.
- **Estado:** pendiente.

### T-03 — Esquema de usuarios y sesiones
- **Agente:** tester + backend.
- **Trabajo:** crear User y AuthSession, roles, email normalizado único y campos de expiración/revocación.
- **Cubre RN:** RN-22, RN-23.
- **Cubre HU:** ninguna directamente; el comportamiento de identidad se cubre en T-08.
- **Depende de:** T-02.
- **Terminada cuando:** pruebas de migración verifican claves, nulabilidad, email único y relación sesión-usuario.
- **Estado:** pendiente.

### T-04 — Esquema de catálogo y unidades
- **Agente:** tester + backend.
- **Trabajo:** crear EquipmentType y AssetUnit con tarifa, condición activa, código único, estados y relaciones.
- **Cubre RN:** RN-01, RN-02, RN-14.
- **Cubre HU:** HU-01, HU-06.
- **Depende de:** T-02.
- **Terminada cuando:** pruebas de esquema verifican estados permitidos, código único, tarifa no negativa y claves foráneas.
- **Estado:** pendiente.

### T-05 — Esquema de reservas y asignaciones
- **Agente:** tester + backend.
- **Trabajo:** crear Reservation, ReservationLine y ReservationAllocation con intervalos, estados, cantidades, snapshots de tarifa y campos de custodia.
- **Cubre RN:** RN-03 a RN-08, RN-10, RN-12, RN-15.
- **Cubre HU:** HU-02 a HU-05, HU-07, HU-08.
- **Depende de:** T-02, T-03, T-04.
- **Terminada cuando:** pruebas de migración verifican relaciones, checks de fechas/cantidad/importe e historial de asignaciones.
- **Estado:** pendiente.

### T-06 — Restricción de solapamiento en PostgreSQL
- **Agente:** tester + backend.
- **Trabajo:** habilitar btree_gist y crear la exclusión GiST por unidad e intervalo semiabierto, limitada a asignaciones no liberadas.
- **Cubre RN:** RN-06, RN-08, RN-11.
- **Cubre HU:** HU-02, HU-04.
- **Depende de:** T-05.
- **Terminada cuando:** pruebas con PostgreSQL rechazan intervalos superpuestos, aceptan intervalos adyacentes y permiten reutilizar asignaciones liberadas.
- **Estado:** pendiente.

### T-07 — Esquema de mantenimiento y eventos operativos
- **Agente:** tester + backend.
- **Trabajo:** crear MaintenanceBlock, ConditionEvent, AllocationChangeEvent e InAppNotice con actores, motivos, timestamps y referencias.
- **Cubre RN:** RN-09, RN-19 a RN-21, RN-24.
- **Cubre HU:** HU-06 a HU-08.
- **Depende de:** T-02 a T-05.
- **Terminada cuando:** pruebas de migración verifican relaciones, rangos, historial conservado e índice para bloqueos vigentes.
- **Estado:** pendiente.

## Etapa 2 — Backend: identidad, catálogo y reglas comunes

### T-08 — Registro, autenticación y autorización
- **Agente:** tester + backend.
- **Trabajo:** implementar registro solo de clientes, hash Argon2id, Bearer JWT, logout y middleware de rol/propiedad.
- **Cubre RN:** RN-22, RN-23.
- **Cubre HU:** HU-03, HU-05 a HU-09 en lo relativo a identidad y permisos.
- **Depende de:** T-01, T-03.
- **Terminada cuando:** pruebas cubren registro, email duplicado, hash no expuesto, tokens ausente/inválido/expirado/revocado, permisos y propiedad.
- **Estado:** pendiente.

### T-09 — Servicios de catálogo e inventario
- **Agente:** tester + backend.
- **Trabajo:** implementar consulta pública y gestión administrativa de tipos, tarifas y unidades; rechazar tipos inactivos o sin tarifa en alquileres.
- **Cubre RN:** RN-01, RN-02, RN-14.
- **Cubre HU:** HU-01, HU-06.
- **Depende de:** T-04, T-08.
- **Terminada cuando:** pruebas cubren catálogo, permisos, tarifas ausentes, tipos inactivos, estados de unidad y códigos duplicados.
- **Estado:** pendiente.

### T-10 — Reloj inyectable y validación temporal
- **Agente:** tester + backend.
- **Trabajo:** implementar Clock de producción y reloj fijo de prueba; validar instantes, zona horaria y límites temporales.
- **Cubre RN:** RN-03 a RN-06, RN-13, RN-17.
- **Cubre HU:** HU-02, HU-03, HU-05, HU-08.
- **Depende de:** T-01.
- **Terminada cuando:** pruebas con reloj fijo cubren ahora/futuro/pasado, límites de 1 y 336 horas, anticipación de 90 días, zona Buenos Aires y rangos adyacentes.
- **Estado:** pendiente.

### T-11 — Servicio de bloqueos de mantenimiento
- **Agente:** tester + backend.
- **Trabajo:** crear, consultar y cancelar bloqueos con motivo administrativo; serializar cambios por unidad y comprobar reservas/custodias.
- **Cubre RN:** RN-02, RN-08, RN-09.
- **Cubre HU:** HU-06.
- **Depende de:** T-04, T-06, T-07, T-08, T-10.
- **Terminada cuando:** pruebas cubren bloqueo válido, indisponibilidad por intervalo, conflicto con asignación/custodia, cancelación lógica y concurrencia con reserva.
- **Estado:** pendiente.

## Etapa 3 — Backend: disponibilidad, precios y reservas

### T-12 — Consulta de disponibilidad
- **Agente:** tester + backend.
- **Trabajo:** calcular unidades disponibles por tipo, cantidad e intervalo, considerando estado, asignaciones, mantenimiento y custodia demorada.
- **Cubre RN:** RN-02, RN-06 a RN-09.
- **Cubre HU:** HU-02.
- **Depende de:** T-04, T-06, T-07, T-10, T-11.
- **Terminada cuando:** pruebas cubren cantidades, estados no alquilables, bloqueos, solapamientos, adyacencia y custodia vencida.
- **Estado:** pendiente.

### T-13 — Cotización y snapshot de tarifa
- **Agente:** tester + backend.
- **Trabajo:** calcular subtotales exactos por tarifa, cantidad e intervalo común; sumar antes de redondear y conservar tarifa/total al confirmar.
- **Cubre RN:** RN-14 a RN-16.
- **Cubre HU:** HU-01, HU-03.
- **Depende de:** T-04, T-09, T-10.
- **Terminada cuando:** pruebas cubren tarifa ausente, múltiples líneas, fracciones de centavo, redondeo mitad hacia arriba al total y cambios posteriores de tarifa.
- **Estado:** pendiente.

### T-14 — Confirmación atómica de reservas
- **Agente:** tester + backend.
- **Trabajo:** crear reserva y asignar todas sus unidades en una transacción; calcular el total en servidor y emitir aviso de confirmación.
- **Cubre RN:** RN-07, RN-08, RN-10 a RN-12, RN-15, RN-24.
- **Cubre HU:** HU-03, HU-04.
- **Depende de:** T-05 a T-10, T-12, T-13.
- **Terminada cuando:** pruebas concurrentes por la última unidad producen una sola confirmación; una solicitud multílínea incompleta no deja datos parciales y la confirmación genera aviso.
- **Estado:** pendiente.

### T-15 — Consulta de reservas y cancelación
- **Agente:** tester + backend.
- **Trabajo:** listar/consultar reservas propias; permitir cancelación del cliente antes del retiro y cancelación administrativa con motivo y aviso.
- **Cubre RN:** RN-12, RN-17, RN-18, RN-24.
- **Cubre HU:** HU-03, HU-05.
- **Depende de:** T-08, T-14.
- **Terminada cuando:** pruebas cubren propiedad, roles, antes/en/después del retiro, estados no cancelables, motivo administrativo, liberación y aviso.
- **Estado:** pendiente.

## Etapa 4 — Backend: entrega y operación

### T-16 — Retiro completo y condición inicial
- **Agente:** tester + backend.
- **Trabajo:** registrar condición por unidad y comenzar custodia solo si todas están presentes y correctas; avisar si el retiro queda bloqueado.
- **Cubre RN:** RN-12, RN-19, RN-20, RN-24.
- **Cubre HU:** HU-07.
- **Depende de:** T-07, T-08, T-14.
- **Terminada cuando:** pruebas cubren retiro válido e inválido y D-29: daño/falta registra incidencia, no entrega ninguna unidad, conserva la reserva confirmada y permite resolverla antes de reintentar.
- **Estado:** pendiente.

### T-17 — Devolución e incidencias
- **Agente:** tester + backend.
- **Trabajo:** registrar cada unidad recibida o faltante, condición y observación; cerrar custodia/reserva al contabilizar todas las asignaciones y emitir aviso de incidencia.
- **Cubre RN:** RN-12, RN-19, RN-20, RN-24.
- **Cubre HU:** HU-07.
- **Depende de:** T-07, T-16.
- **Terminada cuando:** pruebas cubren devolución correcta, dañada y faltante; estados, avisos, liberación y cierre solo tras contabilizar todas las unidades.
- **Estado:** pendiente.

### T-18 — Vencimientos y detección de demoras
- **Agente:** tester + backend.
- **Trabajo:** vencer reservas no retiradas y detectar custodias que superan su devolución con Clock; identificar reservas futuras afectadas.
- **Cubre RN:** RN-12, RN-13, RN-21.
- **Cubre HU:** HU-08.
- **Depende de:** T-10, T-14 a T-17.
- **Terminada cuando:** reloj fijo prueba vencimiento sin retiro, custodia que sigue ocupando la unidad y conflicto futuro visible en las consultas administrativas.
- **Estado:** pendiente.

### T-19 — Reasignación y resolución de conflictos
- **Agente:** tester + backend.
- **Trabajo:** permitir reasignar una unidad de una reserva futura aún no entregada o cancelar esa reserva con motivo; registrar cambios y notificar al cliente.
- **Cubre RN:** RN-09, RN-18, RN-21, RN-24.
- **Cubre HU:** HU-06, HU-08.
- **Depende de:** T-07, T-08, T-11, T-15, T-18.
- **Terminada cuando:** pruebas cubren reemplazo compatible/disponible, incompatibilidad, reserva ya entregada, motivo persistido, cancelación y aviso visible al cliente.
- **Estado:** pendiente.

### T-20 — Inbox de avisos del usuario
- **Agente:** tester + backend.
- **Trabajo:** implementar listado y marcado como leído de avisos; restringir cada consulta a su propietario.
- **Cubre RN:** RN-24.
- **Cubre HU:** HU-08.
- **Depende de:** T-07, T-08, T-14 a T-17, T-19.
- **Terminada cuando:** pruebas cubren aviso propio/ajeno, orden de lectura y avisos de confirmación, cancelación e incidencias emitidos por las tareas productoras.
- **Estado:** pendiente.

### T-21 — Consultas y reportes operativos
- **Agente:** tester + backend.
- **Trabajo:** implementar consultas administrativas por período/estado, disponibilidad/bloqueos, reservas futuras afectadas y devoluciones demoradas.
- **Cubre RN:** RN-21, RN-25.
- **Cubre HU:** HU-08.
- **Depende de:** T-08, T-09, T-11, T-15, T-17 a T-19.
- **Terminada cuando:** pruebas cubren filtros, roles, unidades/bloqueos, conflictos por demora y ausencia de datos de ingresos.
- **Estado:** pendiente.

## Etapa 5 — Frontend (backend terminado antes de comenzar)

### T-22 — Acceso de cliente y catálogo web
- **Agente:** tester + frontend.
- **Trabajo:** implementar registro/login y consulta de catálogo con estados de carga, éxito y error.
- **Cubre RN:** RN-01, RN-14, RN-22, RN-23.
- **Cubre HU:** HU-01, HU-03.
- **Depende de:** T-08, T-09, T-20, T-21.
- **Terminada cuando:** pruebas de componentes cubren autenticación, perfil sin secretos, catálogo activo y errores de API.
- **Estado:** pendiente.

### T-23 — Consulta de disponibilidad y cotización web
- **Agente:** tester + frontend.
- **Trabajo:** permitir elegir intervalo/cantidades, consultar disponibilidad y mostrar la cotización calculada por el servidor.
- **Cubre RN:** RN-03 a RN-08, RN-14 a RN-16.
- **Cubre HU:** HU-02, HU-03.
- **Depende de:** T-10, T-12, T-13, T-22.
- **Terminada cuando:** pruebas de interfaz cubren fechas inválidas, cantidades, falta de disponibilidad, precio y errores de API.
- **Estado:** pendiente.

### T-24 — Confirmación y cancelación web
- **Agente:** tester + frontend.
- **Trabajo:** permitir confirmar una reserva completa, mostrar su estado y cancelar según las reglas del cliente.
- **Cubre RN:** RN-07, RN-10 a RN-12, RN-15, RN-17, RN-18, RN-22.
- **Cubre HU:** HU-03 a HU-05.
- **Depende de:** T-14, T-15, T-23.
- **Terminada cuando:** pruebas cubren confirmación, indisponibilidad concurrente, ausencia de parcial, precio final y cancelación antes/en el retiro.
- **Estado:** pendiente.

### T-25 — Administración web de catálogo y unidades
- **Agente:** tester + frontend.
- **Trabajo:** gestionar tipos, tarifas, unidades y estados con permisos y respuestas de conflicto.
- **Cubre RN:** RN-01, RN-02, RN-14.
- **Cubre HU:** HU-06.
- **Depende de:** T-09, T-21, T-22.
- **Terminada cuando:** pruebas cubren permisos, cambios de catálogo/unidad, tarifas y errores de API.
- **Estado:** pendiente.

### T-26 — Administración web de mantenimiento
- **Agente:** tester + frontend.
- **Trabajo:** crear, consultar y cancelar bloqueos de mantenimiento con motivo y fechas.
- **Cubre RN:** RN-08, RN-09.
- **Cubre HU:** HU-06.
- **Depende de:** T-11, T-21, T-25.
- **Terminada cuando:** pruebas cubren bloqueo válido, conflicto con reserva/custodia, cancelación y mensajes visibles.
- **Estado:** pendiente.

### T-27 — Administración web de retiro y devolución
- **Agente:** tester + frontend.
- **Trabajo:** registrar condición inicial, devolución e incidencias; guiar el retiro completo según D-29.
- **Cubre RN:** RN-12, RN-19, RN-20, RN-24.
- **Cubre HU:** HU-07.
- **Depende de:** T-16, T-17, T-21, T-25.
- **Terminada cuando:** pruebas cubren condición por unidad, retiro bloqueado por daño/falta, cierre de devolución y errores de autorización.
- **Estado:** pendiente.

### T-28 — Administración web de demoras y conflictos
- **Agente:** tester + frontend.
- **Trabajo:** mostrar custodias demoradas, reservas futuras afectadas y acciones de reasignación/cancelación con motivo.
- **Cubre RN:** RN-13, RN-18, RN-21, RN-24.
- **Cubre HU:** HU-08.
- **Depende de:** T-18, T-19, T-21, T-27.
- **Terminada cuando:** pruebas cubren conflicto futuro, resolución autorizada, motivo y aviso al cliente.
- **Estado:** pendiente.

### T-29 — Panel de reportes e inbox web
- **Agente:** tester + frontend.
- **Trabajo:** mostrar filtros/reportes operativos y avisos internos leídos/no leídos.
- **Cubre RN:** RN-21, RN-24, RN-25.
- **Cubre HU:** HU-08.
- **Depende de:** T-20 a T-22, T-25, T-28.
- **Terminada cuando:** pruebas cubren filtros, permisos, lectura de avisos y ausencia de reportes financieros.
- **Estado:** pendiente.

## Etapa 6 — Publicación y entrega académica

### T-30 — Despliegue y entrega
- **Agente:** arquitecto + backend + frontend + tester + revisor.
- **Trabajo:** publicar frontend, backend y base conectados; configurar secretos en el proveedor y completar README e informe de plan/pruebas.
- **Cubre RN:** ninguna nueva; valida los flujos implementados.
- **Cubre HU:** HU-01 a HU-09 en el entorno publicado.
- **Depende de:** T-01 a T-29.
- **Terminada cuando:** una persona externa completa los flujos principales desde el enlace público; README e informe están completos y no hay secretos en Git.
- **Estado:** pendiente.

## Matriz de cobertura

### Reglas de negocio

| Reglas | Tareas responsables |
|---|---|
| RN-01 | T-04, T-09, T-22, T-25 |
| RN-02 | T-04, T-09, T-11, T-12, T-25 |
| RN-03 a RN-06 | T-05, T-06, T-10, T-12, T-13, T-23 |
| RN-07 a RN-08 | T-05, T-06, T-12, T-14, T-23, T-24 |
| RN-09 | T-07, T-11, T-19, T-26 |
| RN-10 a RN-11 | T-05, T-06, T-14, T-24 |
| RN-12 | T-05, T-14 a T-18, T-24, T-27 |
| RN-13 | T-18, T-28 |
| RN-14 | T-04, T-09, T-13, T-22, T-23, T-25 |
| RN-15 a RN-16 | T-05, T-13, T-14, T-23, T-24 |
| RN-17 a RN-18 | T-10, T-15, T-19, T-24, T-28 |
| RN-19 a RN-20 | T-07, T-16, T-17, T-27 |
| RN-21 | T-07, T-18, T-19, T-21, T-28, T-29 |
| RN-22 a RN-23 | T-03, T-08, T-22 |
| RN-24 | T-07, T-14 a T-17, T-19, T-20, T-27 a T-29 |
| RN-25 | T-21, T-29 |

### Historias de usuario

| Historia | Tareas responsables |
|---|---|
| HU-01 | T-04, T-09, T-22 |
| HU-02 | T-06, T-10 a T-12, T-23 |
| HU-03 | T-08, T-10, T-13 a T-15, T-22 a T-24 |
| HU-04 | T-06, T-14, T-24 |
| HU-05 | T-08, T-10, T-15, T-24 |
| HU-06 | T-04, T-09, T-11, T-19, T-25, T-26 |
| HU-07 | T-07, T-16, T-17, T-27 |
| HU-08 | T-10, T-18 a T-21, T-28, T-29 |
| HU-09 | T-21, T-29 |

## Ciclo obligatorio y cierre de tareas

- Antes de implementar, el tester deriva pruebas de los criterios del spec y las ejecuta; deben fallar por la funcionalidad ausente, no por una configuración rota.
- El agente de desarrollo implementa el cambio mínimo y no edita ni elimina pruebas. Si una prueba contradice el spec, informa al analista y detiene esa tarea.
- Después se ejecutan las pruebas afectadas y regresiones; el revisor compara el diff con spec y plan y emite APROBADO/RECHAZADO con hallazgos.
- Solo con pruebas y revisión aprobadas se hace commit y se cambia el estado de la tarea a hecha.
- Esta revisión del backlog no implementa T-01: el ciclo de código empieza después de aprobar y guardar estas tareas.
