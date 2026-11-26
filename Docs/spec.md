# Spec — Sistema de alquiler audiovisual

> **Estado:** especificación funcional v1 propuesta. Las reglas son decisiones de diseño documentadas en `decisiones.md`, no afirmaciones de un cliente real. La definición se basa en las transcripciones de las clases 1 a 10.

## Objetivo
Permitir que clientes consulten equipos audiovisuales y reserven unidades disponibles, mientras el personal administra inventario, entregas, devoluciones, mantenimiento e incidencias. El sistema debe evitar doble asignación y conservar el seguimiento operativo del alquiler.

## Usuarios y roles
- **Cliente:** se registra, consulta catálogo y disponibilidad, crea y cancela sus reservas antes del retiro y consulta su estado.
- **Administrador:** administra tipos y unidades, tarifas, bloqueos de mantenimiento, reservas operativas, entrega/devolución, incidencias y reportes. La cuenta se provisiona fuera del registro público.

## Alcance v1
Incluye catálogo, inventario por unidad física, disponibilidad por intervalo, reservas, cotizaciones, cancelación, registro de entrega/devolución, demora, daños/faltantes, mantenimiento y reportes operativos básicos.

Fuera de alcance: kits, logística de envío, procesamiento o registro de pagos, depósitos, penalidades monetarias, reembolsos e integración de email/SMS/WhatsApp u otros sistemas externos. La entrega académica incluye despliegue online, repositorio público, README e informe de pruebas y plan (clases 5 y 10).

## Reglas de negocio

- **RN-01 (D-04):** Cada unidad física alquilable pertenece a un tipo/modelo y posee un código único. En v1 se alquilan unidades individuales, no kits.
- **RN-02 (D-05, D-27):** Una unidad tiene estado `disponible`, `mantenimiento`, `no localizada` o `retirada`; `no localizada`, `retirada` y `mantenimiento` nunca se asignan. `mantenimiento` es un estado fuera de servicio hasta cambio administrativo; los bloqueos programados por intervalo se registran aparte para unidades disponibles.
- **RN-03 (D-06):** Cada reserva especifica retiro y devolución como fecha/hora. El intervalo reservado es semiabierto `[retiro, devolución)`.
- **RN-04 (D-06):** La devolución debe ser posterior al retiro; la duración debe ser de al menos 1 hora y como máximo 336 horas.
- **RN-05 (D-06):** El retiro debe estar en el futuro y comenzar dentro de los 90 días desde la solicitud. Se usa la hora local del negocio `America/Argentina/Buenos_Aires` para validaciones y presentación.
- **RN-06 (D-07):** Dos intervalos se solapan cuando `inicioA < finB` y `inicioB < finA`. Intervalos adyacentes sin tiempo compartido no se solapan. No existe buffer de preparación en v1.
- **RN-07 (D-08):** Una reserva contiene una o más líneas de tipo/modelo y cantidad; todas comparten el intervalo de la reserva. El sistema asigna las unidades físicas.
- **RN-08 (D-08, D-09):** Cada unidad asignada debe estar libre de reservas confirmadas superpuestas y bloqueos de mantenimiento durante todo el intervalo.
- **RN-09 (D-09):** El administrador no puede crear un bloqueo de mantenimiento que se superponga con reservas confirmadas. Primero debe cancelar o reasignar esas reservas; toda cancelación administrativa registra motivo.
- **RN-10 (D-10):** Si cliente, fechas, tarifa activa y disponibilidad total son válidos, la reserva se confirma en una sola operación. Si alguna línea no tiene cantidad suficiente, no se crea una reserva parcial.
- **RN-11 (D-11):** La asignación se valida atómicamente. En competencia simultánea confirma la transacción que se complete primero; las demás solicitudes incompatibles fallan como no disponibles y no crean reserva.
- **RN-12 (D-12):** Estados posibles: `confirmada`, `entregada`, `devuelta`, `cancelada` y `vencida`. La reserva pasa a `entregada` al registrar retiro, a `devuelta` al recibir todas las unidades o registrar faltantes con incidencia, y a `cancelada` al cancelarse.
- **RN-13 (D-12):** Una reserva confirmada sin entrega pasa a `vencida` cuando se alcanza o supera su hora de retiro. Una reserva entregada cuya hora de devolución se alcanzó o superó permanece ocupando las unidades y se marca demorada hasta el registro de devolución.
- **RN-14 (D-13, D-14):** Cada tipo/modelo alquilable tiene una tarifa activa por hora en ARS. Sin tarifa activa no se puede reservar.
- **RN-15 (D-13, D-28):** Subtotal de línea = tarifa por hora × duración exacta en horas × cantidad; total = suma de subtotales de las líneas. La duración se calcula como minutos transcurridos ÷ 60. El total se redondea a dos decimales con mitad hacia arriba. Al confirmar se conserva el precio y total de esa reserva aunque luego cambie la tarifa del catálogo.
- **RN-16 (D-15):** El sistema muestra cotización, pero no procesa ni registra pagos, depósitos, deudas o reembolsos. El pago es externo y no condiciona la confirmación.
- **RN-17 (D-16):** El cliente puede cancelar una reserva confirmada antes de la hora de retiro sin cargo dentro del sistema. Desde la hora de retiro no puede cancelarla desde su cuenta.
- **RN-18 (D-16):** El administrador puede cancelar por operación una reserva `confirmada` o `vencida`, registrando motivo. Una reserva `entregada` debe cerrarse mediante devolución e incidencias, no cancelarse. Cancelar libera las unidades para solicitudes posteriores. No se calculan penalidades ni reembolsos.
- **RN-19 (D-17, D-29):** Retiro y devolución ocurren en el local. El administrador registra fecha/hora real y las unidades involucradas. Solo una reserva confirmada puede entregarse. El retiro se confirma de forma completa: todas las unidades asignadas deben estar presentes y en condición correcta; si no, no se entrega ninguna y la reserva permanece confirmada para su resolución administrativa.
- **RN-20 (D-19, D-29):** En retiro y devolución, el administrador puede registrar condición `correcto`, `dañado` o `faltante` con observación. Una unidad dañada queda en mantenimiento; una faltante queda `no localizada`; ambas quedan fuera de disponibilidad hasta decisión administrativa. Si en el retiro hay una unidad dañada o faltante, se registra la incidencia y su estado, no se confirma ninguna entrega y el administrador debe resolver la unidad mediante reparación/habilitación, reasignación o cancelación antes de reintentar. La reserva pasa a devuelta cuando cada unidad se recibió o se registró como faltante con incidencia.
- **RN-21 (D-18):** Si vence la hora de devolución sin recepción, la unidad permanece ocupada y el sistema identifica reservas futuras afectadas. El administrador debe reasignar unidad o cancelar la reserva afectada con motivo; el cliente ve el cambio en el sistema. No hay cargo automático por demora.
- **RN-22 (D-20):** Cliente se registra con nombre, email único, teléfono y contraseña; puede indicar una organización. Las contraseñas se almacenan como hash seguro, nunca en texto plano. No se requiere verificación por email.
- **RN-23 (D-20):** Solo clientes se registran públicamente. Administradores se provisionan fuera del registro público.
- **RN-24 (D-21):** No se envían emails, SMS ni mensajes externos. Confirmaciones, cancelaciones y conflictos operativos se consultan dentro de la cuenta/panel.
- **RN-25 (D-22):** El administrador puede consultar reservas por período/estado, disponibilidad/bloqueos y devoluciones demoradas. No hay reportes de ingresos porque pagos no se registran.

## Historias de usuario y criterios de aceptación

### HU-01 — Consultar catálogo
Como cliente, quiero explorar los tipos de equipo para saber qué ofrece la empresa.

- **Dado** un tipo/modelo activo, **cuando** el cliente consulta el catálogo, **entonces** se muestra su descripción y tarifa vigente. (RN-01, RN-14)
- **Dado** un tipo/modelo sin tarifa activa, **cuando** el cliente lo consulta, **entonces** no puede iniciar una reserva de ese tipo y el sistema informa que no está disponible para alquiler. (RN-14)

### HU-02 — Consultar disponibilidad
Como cliente, quiero consultar cantidad disponible para un intervalo y planificar el alquiler.

- **Dadas** unidades sin reservas ni mantenimiento en el intervalo, **cuando** consulto el tipo/modelo y cantidad, **entonces** el sistema indica si la cantidad completa está disponible. (RN-06 a RN-08)
- **Dada** una reserva que termina exactamente cuando inicia el intervalo consultado, **cuando** consulto disponibilidad, **entonces** esa reserva no cuenta como solapamiento. (RN-06)

### HU-03 — Crear reserva
Como cliente registrado, quiero reservar uno o más tipos de equipo para el mismo intervalo.

- **Dado** un cliente registrado, fechas válidas, tarifa activa y cantidad completa disponible, **cuando** confirma la solicitud, **entonces** el sistema crea una reserva confirmada, asigna unidades y conserva la cotización. (RN-03 a RN-05, RN-07 a RN-10, RN-14 a RN-16, RN-22)
- **Dada** una solicitud cuya cantidad no está completamente disponible para una línea, **cuando** el cliente intenta confirmar, **entonces** no se crea ninguna reserva parcial. (RN-08, RN-10)
- **Dada** una fecha inválida, menor a 1 hora, mayor a 336 horas o fuera de la anticipación máxima, **cuando** se solicita la reserva, **entonces** el sistema la rechaza indicando la regla incumplida. (RN-03 a RN-05)
- **Dada** una tarifa que cambia después de la confirmación, **cuando** se consulta la reserva anterior, **entonces** conserva el total confirmado originalmente. (RN-15)
- **Dada** una reserva con varias líneas cuyos subtotales producen fracciones de centavo, **cuando** el sistema calcula el total, **entonces** suma los subtotales exactos y redondea solo el total final a dos decimales con mitad hacia arriba. (RN-15)

### HU-04 — Evitar doble asignación concurrente
Como negocio, quiero impedir reservas simultáneas incompatibles para no prometer una unidad a dos clientes.

- **Dadas** dos solicitudes simultáneas para la última unidad disponible en intervalos superpuestos, **cuando** ambas intentan confirmar, **entonces** exactamente una se confirma y la otra recibe indisponibilidad sin reserva parcial. (RN-11)

### HU-05 — Cancelar reserva
Como cliente, quiero cancelar antes del retiro si ya no necesito el equipo.

- **Dada** una reserva confirmada, **cuando** el cliente cancela antes de la hora de retiro, **entonces** se cancela, se libera la unidad y no se aplica cargo dentro del sistema. (RN-17, RN-18)
- **Dada** una reserva cuya hora de retiro ya llegó, **cuando** el cliente intenta cancelarla, **entonces** el sistema rechaza la acción y deja la reserva bajo gestión operativa. (RN-17)

### HU-06 — Administrar catálogo e inventario
Como administrador, quiero gestionar tipos, tarifas y unidades para mantener el catálogo confiable.

- **Dado** un modelo con unidades o reservas, **cuando** se actualiza su tarifa, **entonces** las reservas ya confirmadas mantienen su cotización. (RN-14, RN-15)
- **Dada** una unidad con una reserva confirmada superpuesta, **cuando** intento bloquearla por mantenimiento, **entonces** el sistema rechaza el bloqueo hasta resolver la reserva existente. (RN-09)
- **Dado** un bloqueo válido de mantenimiento, **cuando** un cliente consulta el intervalo, **entonces** la unidad no se cuenta disponible. (RN-08, RN-09)

### HU-07 — Registrar entrega y devolución
Como administrador, quiero registrar movimientos físicos para conocer la custodia y condición del equipo.

- **Dada** una reserva confirmada, **cuando** registro el retiro de todas sus unidades, **entonces** la reserva pasa a entregada y cada condición inicial queda registrada. (RN-12, RN-19, RN-20)
- **Dada** una reserva con una unidad dañada o ausente al retiro, **cuando** el administrador registra la condición, **entonces** no se entrega ninguna unidad, se conserva la reserva confirmada, se registra la incidencia y el administrador debe reparar/habilitar, reasignar o cancelar antes de reintentar. (RN-19, RN-20)
- **Dada** una reserva entregada, **cuando** registro las unidades recibidas y cualquier faltante con incidencia, **entonces** la reserva pasa a devuelta y queda registrada la condición de cada unidad. (RN-12, RN-19, RN-20)
- **Dada** una unidad dañada o faltante al volver, **cuando** se registra la incidencia, **entonces** la unidad queda en mantenimiento o no localizada, respectivamente, y fuera de disponibilidad hasta decisión administrativa. (RN-20)

### HU-08 — Gestionar vencimientos y demoras
Como administrador, quiero identificar reservas no retiradas y devoluciones tardías para actuar sobre inventario afectado.

- **Dada** una reserva confirmada sin entrega cuya hora de retiro se alcanzó o superó, **cuando** el sistema actualiza su estado, **entonces** queda vencida y no conserva asignación activa. (RN-12, RN-13)
- **Dada** una unidad no devuelta cuando se alcanza o supera la hora pactada y una reserva futura afectada, **cuando** el sistema detecta la demora, **entonces** conserva la unidad ocupada y muestra el conflicto al administrador. (RN-13, RN-21)

### HU-09 — Consultar operación
Como administrador, quiero consultar reservas, disponibilidad y demoras para organizar el negocio.

- **Dado** un período de consulta, **cuando** el administrador abre el panel, **entonces** puede filtrar reservas por estado/período y ver unidades bloqueadas y devoluciones demoradas. (RN-25)

## Casos límite
- Intervalos adyacentes: no se solapan; igualdad de fin e inicio es válida (RN-06).
- Dos clientes compiten por la última unidad: una sola transacción confirma (RN-11).
- Una solicitud de varias unidades no tiene inventario completo: no hay confirmación parcial (RN-10).
- Una unidad está en mantenimiento o retirada: no se asigna (RN-02, RN-08, RN-09).
- La tarifa cambia luego de reservar: se conserva la tarifa histórica (RN-15).
- El cliente intenta cancelar al llegar la hora de retiro: no puede; debe intervenir el administrador (RN-17, RN-18).
- No se registra devolución a tiempo y existe reserva futura: la unidad sigue ocupada y el administrador resuelve el conflicto (RN-21).
- Daño o faltante al volver: la unidad dañada queda en mantenimiento y la faltante no localizada hasta decisión administrativa (RN-20).
- Daño o faltante detectado al retirar: no se entrega parcialmente la reserva; se conserva confirmada y requiere reparar/habilitar, reasignar o cancelar (RN-19, RN-20).
- No existe tarifa para el modelo: no se ofrece para reserva (RN-14).

## Requisitos de entrega académica
- Aplicación accesible por internet con frontend y backend funcionando y conectados a la base de datos.
- Repositorio público de GitHub con código, documentación, README y evidencias/informe de pruebas y plan.
- No se exige proveedor de hosting ni tecnología particular; se elegirán en el plan de despliegue.
## Plan de desarrollo por etapas
1. **Catálogo e inventario:** HU-01, HU-06; definir modelo de equipo y unidad, acceso de administrador.
2. **Disponibilidad:** HU-02; intervalos, mantenimiento y cálculo de solapamientos.
3. **Reservas y cotización:** HU-03, HU-05; estados, precio congelado, cancelación y asignación transaccional (HU-04).
4. **Operación:** HU-07, HU-08; entrega, devolución, condición, demoras e incidencias.
5. **Panel operativo:** HU-09; filtros y disponibilidad.
6. **Entrega:** T-19; despliegue online, README público e informe de plan y pruebas.

La primera tarea de implementación no debe comenzar hasta que el plan técnico asigne ubicación a cada regla y la primera historia tenga criterios verificables.

## Trazabilidad
- Contexto: `mi idea.md`.
- Decisiones de diseño: `decisiones.md` (`D-01` a `D-29`).
- Términos: `glosario.md`.
- Requisitos académicos conocidos en `preguntas-abiertas.md` (PA-17 y PA-18, resueltas).
- Metodología y exigencias conocidas del curso: transcripciones, especialmente clase 5.
