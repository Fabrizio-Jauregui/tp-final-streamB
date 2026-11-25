# Tareas — Alquiler audiovisual

> Derivadas de `spec.md` y `plan.md`. El orden es por dependencias, no por el número de HU. Todas están pendientes. Una tarea solo se marca hecha cuando sus pruebas pasan y el revisor la aprueba.

## Etapa 1 — Base backend y persistencia

### T-01 — Estructura backend y ciclo de pruebas
- **Agente:** backend + tester.
- **Trabajo:** crear la base Node/TypeScript/Express, configuración de Vitest/Supertest, configuración PostgreSQL de prueba y scripts básicos.
- **Cubre:** habilita todas las RN/HU; no implementa lógica de negocio.
- **Depende de:** ninguna.
- **Terminada cuando:** servidor de salud responde y prueba HTTP de salud pasa en local y entorno de prueba.
- **Estado:** pendiente.

### T-02 — Esquema relacional y migraciones
- **Agente:** backend.
- **Trabajo:** modelar usuarios, catálogo, unidades, reservas/líneas/asignaciones, mantenimiento, eventos de condición y avisos. Añadir claves, checks e índices.
- **Cubre:** RN-01, RN-02, RN-12, RN-14, RN-19, RN-20, RN-22.
- **Depende de:** T-01.
- **Terminada cuando:** migraciones aplican y revierten en PostgreSQL de prueba; constraints básicas tienen pruebas de integración.
- **Estado:** pendiente.

### T-03 — Regla de no solapamiento a nivel base de datos
- **Agente:** backend + tester.
- **Trabajo:** implementar la protección de intervalos por unidad con exclusion constraint y soporte `btree_gist`; excluir asignaciones liberadas según el modelo aprobado.
- **Cubre:** RN-06, RN-08, RN-11.
- **Depende de:** T-02.
- **Terminada cuando:** pruebas concurrentes prueban que una unidad no admite asignaciones activas superpuestas y sí admite intervalos adyacentes.
- **Estado:** pendiente.

## Etapa 2 — Identidad y catálogo backend

### T-04 — Registro, inicio y cierre de sesión
- **Agente:** backend + tester.
- **Trabajo:** registrar clientes, hash de contraseña, email único y sesión segura; provisionamiento administrativo fuera del registro público.
- **Cubre:** RN-22, RN-23; HU-03.
- **Depende de:** T-02.
- **Terminada cuando:** pruebas cubren registro válido, email duplicado, contraseña nunca devuelta y permisos por sesión/rol.
- **Estado:** pendiente.

### T-05 — Catálogo y unidades físicas
- **Agente:** backend + tester.
- **Trabajo:** servicios y endpoints para modelos, tarifas, estado y unidades; impedir publicar/reservar modelos inactivos o sin tarifa.
- **Cubre:** RN-01, RN-02, RN-14; HU-01, HU-06.
- **Depende de:** T-02, T-04.
- **Terminada cuando:** pruebas de catálogo público y operaciones administrativas pasan, incluidas tarifa ausente y código duplicado.
- **Estado:** pendiente.

### T-06 — Mantenimiento de unidades
- **Agente:** backend + tester.
- **Trabajo:** crear y consultar bloqueos de mantenimiento; rechazar conflicto con asignaciones existentes.
- **Cubre:** RN-08, RN-09; HU-06.
- **Depende de:** T-03, T-05.
- **Terminada cuando:** pruebas cubren bloqueo válido, unidad no disponible en intervalo y conflicto rechazado.
- **Estado:** pendiente.

## Etapa 3 — Disponibilidad, cotización y reserva backend

### T-07 — Validación temporal y cálculo de intervalos
- **Agente:** backend + tester.
- **Trabajo:** implementar límites de 1 a 336 horas, anticipación máxima de 90 días, zona horaria de negocio y detección de solapamiento semiabierto.
- **Cubre:** RN-03 a RN-06; HU-02, HU-03.
- **Depende de:** T-01.
- **Terminada cuando:** pruebas cubren límites, pasado, máximo, igualdad fin/inicio y transiciones de horario local.
- **Estado:** pendiente.

### T-08 — Consulta de disponibilidad
- **Agente:** backend + tester.
- **Trabajo:** calcular unidades disponibles por tipo, cantidad e intervalo, considerando reservas y mantenimiento.
- **Cubre:** RN-02, RN-06 a RN-09; HU-02.
- **Depende de:** T-03, T-05, T-06, T-07.
- **Terminada cuando:** pruebas cubren cantidades, reservas superpuestas, intervalos adyacentes, mantenimiento y unidades retiradas/no localizadas.
- **Estado:** pendiente.

### T-09 — Cotización y snapshot de tarifa
- **Agente:** backend + tester.
- **Trabajo:** calcular precio exacto por hora, cantidad y duración; redondear a dos decimales y conservar tarifa/total en reserva.
- **Cubre:** RN-14 a RN-16; HU-01, HU-03.
- **Depende de:** T-05, T-07.
- **Terminada cuando:** pruebas cubren cambio posterior de tarifa, tarifa faltante, cantidades y redondeo.
- **Estado:** pendiente.

### T-10 — Confirmación atómica y asignación concurrente
- **Agente:** backend + tester.
- **Trabajo:** confirmar todas las líneas en una transacción, asignar unidades y manejar conflicto de concurrencia sin reserva parcial.
- **Cubre:** RN-07 a RN-11; HU-03, HU-04.
- **Depende de:** T-03, T-04, T-08, T-09.
- **Terminada cuando:** pruebas de integración incluyen dos solicitudes simultáneas por última unidad y solicitud multidetalle parcialmente indisponible.
- **Estado:** pendiente.

### T-11 — Consulta de reservas y cancelación
- **Agente:** backend + tester.
- **Trabajo:** listar reservas propias y permitir cancelación del cliente antes del retiro; permitir cancelación administrativa con motivo.
- **Cubre:** RN-12, RN-17, RN-18; HU-05.
- **Depende de:** T-10.
- **Terminada cuando:** pruebas cubren antes/en/después del retiro, estados no cancelables y liberación de unidades.
- **Estado:** pendiente.

## Etapa 4 — Operación backend

### T-12 — Registrar retiro y condición inicial
- **Agente:** backend + tester.
- **Trabajo:** registrar timestamp, administrador y condición de cada unidad; transición de confirmada a entregada.
- **Cubre:** RN-12, RN-19, RN-20; HU-07.
- **Depende de:** T-10, T-04.
- **Terminada cuando:** pruebas cubren reserva confirmada, estados inválidos, rol requerido y evento de condición.
- **Estado:** pendiente.

### T-13 — Registrar devolución e incidencias
- **Agente:** backend + tester.
- **Trabajo:** registrar devolución parcial, condición, daño o faltante; cerrar reserva cuando todas las unidades se reciban o queden reportadas como faltantes.
- **Cubre:** RN-12, RN-19, RN-20; HU-07.
- **Depende de:** T-12.
- **Terminada cuando:** pruebas cubren devolución normal, dañada, faltante, estados de unidad y cierre de reserva.
- **Estado:** pendiente.

### T-14 — Vencimientos, demoras y avisos operativos
- **Agente:** backend + tester.
- **Trabajo:** detectar no retiro y demora, mantener unidad ocupada y señalar reservas futuras afectadas; emitir avisos internos visibles.
- **Cubre:** RN-13, RN-21, RN-24; HU-08.
- **Depende de:** T-10, T-11, T-13.
- **Terminada cuando:** pruebas cubren no retiro, demora sin liberación y conflicto futuro mostrado al administrador/cliente.
- **Estado:** pendiente.

### T-15 — Panel y reportes operativos
- **Agente:** backend + tester.
- **Trabajo:** endpoints administrativos para filtrar reservas, unidades bloqueadas/disponibles y demoras por período.
- **Cubre:** RN-25; HU-09.
- **Depende de:** T-05, T-06, T-11, T-14.
- **Terminada cuando:** pruebas de autorización, filtros y datos de cada reporte pasan.
- **Estado:** pendiente.

## Etapa 5 — Frontend (después del backend)

### T-16 — Registro y catálogo web
- **Agente:** frontend + tester.
- **Trabajo:** pantallas de registro/inicio de sesión y catálogo con consumo de API, estados de carga y error.
- **Cubre:** HU-01, HU-03; RN-22, RN-23.
- **Depende de:** T-04, T-05, T-15.
- **Terminada cuando:** pruebas de componentes cubren flujos felices, validación y errores API.
- **Estado:** pendiente.

### T-17 — Disponibilidad, cotización y reserva web
- **Agente:** frontend + tester.
- **Trabajo:** selector de intervalo/cantidades, consulta de disponibilidad, resumen de precio y confirmación; representar conflictos concurrentes.
- **Cubre:** HU-02 a HU-05; RN-03 a RN-18.
- **Depende de:** T-07 a T-11, T-15, T-16.
- **Terminada cuando:** pruebas de interfaz cubren fechas inválidas, falta de disponibilidad, confirmación, precio y cancelación.
- **Estado:** pendiente.

### T-18 — Operación administrativa web
- **Agente:** frontend + tester.
- **Trabajo:** pantallas para catálogo/unidades, mantenimiento, retiro/devolución, incidencias, avisos y reportes.
- **Cubre:** HU-06 a HU-09; RN-09, RN-19 a RN-25.
- **Depende de:** T-05 a T-16.
- **Terminada cuando:** pruebas de interfaz cubren permisos, flujos operativos y errores de API.
- **Estado:** pendiente.

## Revisión y criterio de cierre
- El orden se determina por dependencias; números solo identifican tareas.
- Cada tarea empieza con tests derivados de sus criterios de aceptación; los tests deben fallar antes de implementar.
- El desarrollador no modifica ni elimina tests para conseguir que pasen; si detecta un test incorrecto, lo reporta al analista/tester.
- El revisor compara cambios con `spec.md` y `plan.md`; sin aprobación no se hace commit ni se marca tarea hecha.
- La primera tarea de código es T-01 y debe realizarse después de aprobar este desglose y completar la configuración de agentes/Git que exige el curso. La entrega final se cierra con T-19.



## Etapa 6 — Publicación y entrega académica

### T-19 — Desplegar, documentar y preparar entrega
- **Agente:** arquitecto + backend + frontend + tester + revisor.
- **Trabajo:** publicar frontend, backend y base de datos; configurar secretos mediante variables de entorno; completar README público e informe de plan y pruebas. Elegir proveedores entre opciones disponibles al momento de desplegar.
- **Cubre:** requisito académico de clases 5 y 10; flujos HU-01 a HU-09.
- **Depende de:** T-01 a T-18.
- **Terminada cuando:** una persona externa puede abrir el enlace público y completar los flujos principales; README explica uso/configuración; informe contiene plan y resultados de pruebas; no hay secretos en Git.
- **Estado:** pendiente.

