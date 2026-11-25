# Glosario

| Término | Definición |
|---|---|
| Tipo/modelo de equipo | Categoría de catálogo que describe un equipo alquilable, su tarifa por hora y descripción. |
| Unidad física | Ejemplar individual identificado por un código único y asignable a una reserva. |
| Kit | Grupo de equipos que se alquila como conjunto. Fuera del alcance v1. |
| Cliente | Persona u organización que se registra y solicita reservas. |
| Administrador | Usuario interno provisionado por la empresa, con permisos para gestionar catálogo, unidades, reservas, entregas, devoluciones, incidencias y reportes. |
| Reserva | Compromiso confirmado que asigna una o más unidades a un cliente durante un intervalo. |
| Intervalo de alquiler | Período semiabierto `[retiro, devolución)`. El instante de devolución no forma parte del período reservado. |
| Solapamiento | Dos intervalos se solapan si cada uno comienza antes de que termine el otro: `inicioA < finB` y `inicioB < finA`. |
| Disponibilidad | Existencia de suficientes unidades del tipo solicitado que no estén reservadas ni bloqueadas por mantenimiento durante todo el intervalo. |
| Cotización | Precio calculado al confirmar, usando tarifa por hora, horas contratadas y cantidad. Se conserva como copia en la reserva. |
| Entrega | Registro administrativo de la entrega física de las unidades al cliente; cambia la reserva a `entregada`. |
| Devolución | Registro de recepción de todas las unidades de la reserva; cierra la custodia salvo que haya incidencias pendientes. |
| Mantenimiento | Bloqueo temporal de una unidad que impide asignarla durante el intervalo indicado. |
| Demora | Situación en la que una unidad no fue devuelta a la hora de devolución contratada. Sigue ocupada. |
| Incidencia | Observación administrativa sobre daño o faltante; no implica automáticamente un cargo. |
| Reserva confirmada | Reserva creada tras validar cliente, fechas, tarifa activa y disponibilidad completa. |
| Reserva vencida | Reserva no entregada cuyo instante de retiro ya pasó. |
| Cancelación | Cierre de una reserva antes o por decisión administrativa; libera las unidades y registra motivo cuando cancela el administrador. |
| Pago/deuda/depósito | Conceptos financieros no gestionados por la aplicación v1. El pago se realiza fuera del sistema. |
| Concurrencia | Dos o más solicitudes que intentan asignar el mismo inventario simultáneamente; la confirmación atómica impide doble asignación. |
| Disponibilidad futura afectada | Reserva confirmada posterior cuya unidad asignada no puede entregarse porque una devolución anterior está demorada. |
| Hora local del negocio | Timestamps presentados y validados en `America/Argentina/Buenos_Aires`; almacenamiento técnico en UTC. |

