# Decisiones del proyecto

Las decisiones siguientes son propuestas de diseño tomadas por Codex para hacer el proyecto coherente y realizable. No se atribuyen a un cliente real ni a la docente. Si una transcripción posterior fija un requisito distinto, prevalece el requisito del curso y se actualizan los documentos.

## Alcance y curso

### D-01 — Tipo de proyecto
- **Decisión:** sistema web para una empresa pequeña de alquiler audiovisual, destinado a productoras, fotógrafos y organizadores de eventos.
- **Origen:** elección explícita del estudiante.
- **Afecta:** idea y spec.

### D-02 — Alcance manejable
- **Decisión:** priorizar inventario individual, disponibilidad, reservas, entrega/devolución, incidencias y administración básica. Excluir kits, logística de envío, cobros online e integraciones externas en v1.
- **Justificación:** concentra la complejidad en reglas de disponibilidad, concurrencia y ciclo del alquiler sin ampliar el proyecto con servicios externos.
- **Afecta:** RN-01 a RN-25 y entrega académica.

### D-03 — Requisitos académicos conocidos
- **Decisión:** el curso permite elegir tema y trabajar individualmente o en grupos de hasta cinco; el proyecto debe superar un ABM sencillo y documentar idea, preguntas, decisiones, glosario, spec, agentes, plan y tareas. Se requiere código probado en un repositorio público GitHub, aplicación accesible por internet, README e informe de pruebas y plan.
- **Origen:** transcripciones de clases 5 y 10.
- **Tecnología y hosting:** son elecciones del estudiante; las plataformas mencionadas en clase son ejemplos, no requisitos.
- **Estado:** requisitos académicos conocidos; no queda consigna externa pendiente.
## Inventario y disponibilidad

### D-04 — Elementos alquilables
- **Decisión:** se alquilan unidades físicas individuales. Cada unidad pertenece a un tipo/modelo de equipo y tiene un código único. Los kits quedan fuera de v1.
- **Justificación:** disponibilidad y estado se controlan por ejemplar real.
- **Resuelve:** PA-01.

### D-05 — Estado de unidad
- **Decisión:** una unidad puede estar `disponible`, `mantenimiento`, `no localizada` o `retirada`. Los estados `no localizada`, `retirada` y `mantenimiento` no se asignan. El estado `mantenimiento` es una condición general hasta que el administrador la habilite; un bloqueo programado por intervalo es un registro separado para unidades que siguen disponibles en general.
- **Resuelve:** PA-01, PA-12.

### D-06 — Intervalo del alquiler
- **Decisión:** el cliente elige fecha y hora de retiro y devolución. El intervalo es semiabierto `[retiro, devolución)`: incluye el instante de retiro y excluye el de devolución. La devolución debe ser posterior al retiro; duración mínima 1 hora y máxima 14 días (336 horas). El inicio debe ser futuro y no superar 90 días desde la solicitud.
- **Justificación:** timestamps precisos permiten definir sin ambigüedad solapamientos y concurrencia.
- **Resuelve:** PA-02, PA-03.

### D-07 — Solapamiento
- **Decisión:** dos intervalos se solapan cuando `inicioA < finB` y `inicioB < finA`. Una reserva que termina exactamente cuando otra comienza no se solapa. No hay tiempo de preparación adicional en v1.
- **Resuelve:** PA-02.

### D-08 — Disponibilidad de cantidades
- **Decisión:** el cliente pide un tipo/modelo y cantidad; el sistema asigna unidades físicas libres de ese modelo. Una reserva puede incluir varias líneas, pero todas comparten el mismo intervalo. La disponibilidad requiere suficientes unidades para todas las líneas.
- **Resuelve:** PA-01, PA-02.

### D-09 — Mantenimiento
- **Decisión:** solo el administrador crea bloqueos de mantenimiento. Se rechaza un bloqueo que se superponga con reservas confirmadas existentes; primero el administrador debe cancelar o reasignar esas reservas con motivo registrado. Las unidades bloqueadas no aparecen como disponibles en ese intervalo.
- **Resuelve:** PA-12.

## Solicitud, confirmación y concurrencia

### D-10 — Confirmación
- **Decisión:** no existe solicitud pendiente en el flujo normal. Si el cliente está registrado y el inventario completo está disponible, el sistema crea y confirma la reserva en una sola operación; de lo contrario, no crea reserva parcial y explica la falta de disponibilidad.
- **Justificación:** evita estados temporales y reservas incompletas.
- **Resuelve:** PA-04.

### D-11 — Concurrencia
- **Decisión:** la asignación de unidades se valida de forma atómica en el servidor. Si dos solicitudes compiten por el mismo inventario, gana la primera que confirme la operación transaccional; la otra recibe indisponibilidad y no crea reserva.
- **Resuelve:** PA-05.

### D-12 — Estados de reserva
- **Decisión:** estados: `confirmada`, `entregada`, `devuelta`, `cancelada` y `vencida`. Una reserva confirmada pasa a entregada al registrar la entrega; a devuelta al recibir todas las unidades o registrar faltantes con incidencia; a cancelada si el cliente cancela una confirmada antes del retiro o el administrador cancela una confirmada/vencida; a vencida cuando no se registró entrega y la hora de retiro ya se alcanzó. Las reservas entregadas que alcanzan o superan la hora de devolución sin cierre generan estado operativo de demora y no liberan unidades.
- **Resuelve:** PA-04, PA-09, PA-10.
## Precio, pagos y cancelaciones

### D-13 — Tarifa
- **Decisión:** cada tipo/modelo tiene una tarifa por hora en pesos argentinos (ARS). El precio de cada línea se calcula como tarifa por hora × duración exacta en horas × cantidad; la duración se obtiene de minutos transcurridos divididos por 60. El total de una reserva con varias líneas es la suma de los subtotales exactos, y ese total se redondea a dos decimales con mitad hacia arriba. No se redondean líneas por separado. El sistema conserva una copia de la tarifa y el total al confirmar; no hay descuentos ni impuestos desglosados en v1.
- **Justificación:** fórmula transparente y fácil de verificar; el precio histórico no cambia si luego cambia la tarifa.
- **Resuelve:** PA-06.
### D-14 — Precio faltante
- **Decisión:** un tipo/modelo sin tarifa activa no puede reservarse; el sistema informa que no está disponible para alquiler.
- **Resuelve:** PA-06.

### D-15 — Pagos
- **Decisión:** el sistema calcula y muestra la cotización, pero no registra pagos, depósitos, deudas ni reembolsos y no procesa pagos online. El pago se realiza fuera del sistema y no condiciona la confirmación.
- **Justificación:** acota integraciones y evita inventar políticas financieras.
- **Resuelve:** PA-07.

### D-16 — Cancelación
- **Decisión:** el cliente puede cancelar una reserva confirmada antes de la hora de retiro, sin cargo dentro del sistema. Al llegar la hora de retiro ya no puede cancelarla desde su cuenta. El administrador puede cancelar por operación una reserva confirmada o vencida, registrando motivo y mostrando el aviso al cliente. Una reserva ya entregada se cierra mediante devolución e incidencias, no se cancela. Toda cancelación libera las unidades para nuevas reservas desde ese momento; no hay penalidad ni reembolso gestionado por la aplicación.
- **Resuelve:** PA-08.
## Operación e incidencias

### D-17 — Retiro y devolución
- **Decisión:** retiro y devolución se realizan en el local. El administrador registra fecha/hora real y unidad(es) entregada(s)/recibida(s). La entrega exige una reserva confirmada; la devolución cierra la custodia cuando cada unidad fue recibida o quedó registrada como faltante con incidencia.
- **Resuelve:** PA-09.

### D-18 — Demora
- **Decisión:** si una unidad no fue devuelta al llegar la hora de devolución, la reserva se marca demorada y la unidad sigue ocupada. El sistema identifica reservas futuras afectadas. El administrador debe reasignar unidades o cancelar las reservas futuras con motivo; no se calcula penalidad monetaria.
- **Justificación:** protege inventario y comunica el conflicto sin inventar cargos.
- **Resuelve:** PA-10.

### D-19 — Daños y faltantes
- **Decisión:** en retiro y devolución el administrador registra la condición (`correcto`, `dañado`, `faltante`) y una observación. Una unidad dañada queda en mantenimiento; una unidad faltante queda no localizada. Ambas quedan fuera de disponibilidad hasta que el administrador la marque disponible, en mantenimiento o retirada. La reserva se considera devuelta cuando cada unidad asignada se recibió o quedó registrada como faltante con incidencia. El sistema conserva la incidencia, pero no calcula cargos ni determina responsabilidad.
- **Resuelve:** PA-11.
## Usuarios, notificaciones y reportes

### D-20 — Clientes y roles
- **Decisión:** roles v1: cliente y administrador. Cliente se registra con nombre, email único, teléfono y contraseña; si representa una organización, agrega nombre de organización. Las contraseñas se almacenan con hash seguro, nunca en texto plano. El administrador lo crea/provisiona fuera del registro público. No se requiere verificación por email.
- **Justificación:** datos mínimos para contacto y reserva; sin integración de correo.
- **Resuelve:** PA-13, PA-14.

### D-21 — Notificaciones
- **Decisión:** sin email, SMS ni WhatsApp en v1. Confirmaciones, cancelaciones y conflictos de operación se muestran en la cuenta del cliente y en el panel administrativo.
- **Resuelve:** PA-15, PA-18.

### D-22 — Reportes
- **Decisión:** panel administrativo con reservas por período/estado, unidades disponibles o bloqueadas y devoluciones demoradas. Sin reportes financieros porque el sistema no registra pagos.
- **Resuelve:** PA-16.

### D-23 — Integraciones y publicación
- **Decisión:** no se requieren integraciones externas en v1. La entrega académica publicará frontend, backend y base de datos en internet; el repositorio de GitHub será público e incluirá README e informe con plan y pruebas. El proveedor queda a elección técnica.
- **Origen:** transcripción clase 10.
- **Resuelve:** PA-18.
## Arquitectura propuesta

### D-24 — Stack técnico inicial
- **Decisión:** React + TypeScript para frontend; Node.js + TypeScript + Express para backend; PostgreSQL como base relacional.
- **Origen:** stack React/Node usado como referencia en clase 1, libertad de tecnología de la docente y PostgreSQL/arquitectura por capas mostrado en clase 5. No es tecnología obligatoria.
- **Afecta:** `plan.md`.

### D-25 — Pruebas y autenticación iniciales
- **Decisión:** Vitest, Supertest y React Testing Library como propuesta de herramientas; autenticación con token Bearer enviado en Authorization, según el ejemplo de clase 9. El secreto del token se configura mediante variable de entorno.
- **Origen:** propuesta de arquitectura basada en las clases 7 y 9; se valida en el plan técnico.
- **Afecta:** `plan.md`, `tareas.md`.

### D-26 — Modalidad individual
- **Decisión:** el estudiante realizará este proyecto individualmente.
- **Origen:** decisión explícita del estudiante; permitida por la clase 5.
- **Afecta:** organización de tareas y entrega, no las reglas del sistema.

## Aclaraciones surgidas al revisar la arquitectura

### D-27 — Estados generales y bloqueos de mantenimiento
- **Decisión:** `mantenimiento` en el estado de unidad significa no alquilable hasta que un administrador cambie su estado. `MaintenanceBlock` bloquea una unidad de otro modo disponible solo para un intervalo programado.
- **Origen:** aclaración de diseño para distinguir estado de inventario de bloqueo temporal, compatible con D-05/D-09.
- **Afecta:** RN-02, RN-08, RN-09, HU-02 y HU-06.

### D-28 — Total de reservas con varias líneas
- **Decisión:** calcular los subtotales exactos por línea y sumarlos; redondear solo el total final a dos decimales, con mitad hacia arriba. Cada línea usa su tarifa vigente al confirmar, duración común y cantidad.
- **Origen:** aclaración de diseño derivada del modelo multiequipo de D-08 y la tarifa de D-13.
- **Afecta:** RN-15, HU-03.

### D-29 — Retiro completo y condición inicial
- **Decisión:** el retiro es completo o no se confirma: todas las unidades asignadas deben estar presentes y en condición `correcto`. Si alguna unidad está dañada o no localizada, no se entrega ninguna; se registra la incidencia y se actualiza su estado, la reserva sigue confirmada y el administrador debe resolver la unidad mediante reparación y habilitación, reasignación o cancelación antes de reintentar.
- **Justificación:** evita custodia parcial y define qué ocurre si el inventario físico no coincide con la asignación.
- **Origen:** decisión de diseño para completar el flujo de retiro indicado en D-17/D-19 y hacerlo implementable.
- **Afecta:** RN-19, RN-20, HU-07 y la API de retiro.

## Estado de preguntas
No quedan preguntas abiertas según las transcripciones disponibles. PA-17 y PA-18 se cerraron en `preguntas-abiertas.md`. Si la docente actualiza requisitos, se registrará como nueva decisión.
