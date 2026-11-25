# Alquiler audiovisual

Sistema web para que una pequeña empresa gestione el alquiler de equipos audiovisuales. El proyecto prioriza inventario por unidad física, disponibilidad por período, reservas sin solapamientos y el seguimiento de entregas, devoluciones e incidencias.

## Documentación del proyecto

- [Idea](Docs/mi%20idea.md)
- [Preguntas abiertas](Docs/preguntas-abiertas.md)
- [Decisiones](Docs/decisiones.md)
- [Glosario](Docs/glosario.md)
- [Spec funcional](Docs/spec.md)
- [Plan técnico](Docs/plan.md)
- [Tareas](Docs/tareas.md)
- [Instrucciones generales para agentes](AGENTS.md)

## Estado

Etapa de preparación y planificación. La estructura de frontend y backend está vacía; aún no se implementaron funcionalidades.

## Tecnologías previstas

React + TypeScript, Node.js + TypeScript + Express y PostgreSQL son la propuesta documentada en `Docs/plan.md`. El stack podrá ajustarse si el plan técnico se revisa.

## Requisitos previos, instalación y ejecución

Pendiente: completar cuando se configure el proyecto en `backend/` y `frontend/`. No hay dependencias instalables ni comandos de ejecución definidos todavía.

## Variables de entorno

Los secretos y credenciales se configurarán localmente y en el proveedor de despliegue. Nunca subir archivos `.env` con valores reales. Se agregará un `.env.example` cuando se definan las variables necesarias.

## Pruebas

El flujo previsto es pruebas primero, implementación, revisión contra `Docs/spec.md` y `Docs/plan.md`, y commit por tarea. Los comandos se documentarán cuando se configure el backend y frontend.

## Entrega

La clase 10 requiere una aplicación accesible por internet, repositorio público, README e informe con el plan y las pruebas. El enlace de la aplicación se añadirá cuando se publique.
