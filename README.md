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

T-01 implementa la base del backend y su endpoint de salud. Las funcionalidades del sistema siguen pendientes.

## Tecnologías previstas

React + TypeScript, Node.js + TypeScript + Express y PostgreSQL son la propuesta documentada en `Docs/plan.md`. El stack podrá ajustarse si el plan técnico se revisa.

## Requisitos previos

Node.js 22.12 o superior y npm. El backend usa Node.js con TypeScript y Express.

## Instalación y ejecución del backend

Desde la carpeta `backend/`:

```powershell
npm install
npm run dev
```

El backend escucha en `http://localhost:3000` por defecto. Se puede cambiar el puerto con la variable `PORT`.

La ruta `GET /health` devuelve `{"status":"ok"}` cuando el servidor está disponible.

## Comprobaciones del backend

Desde `backend/`:

```powershell
npm test
npm run typecheck
npm run build
npm start
```

## Variables de entorno

Los secretos y credenciales se configurarán localmente y en el proveedor de despliegue. Nunca subir archivos `.env` con valores reales. Se agregará un `.env.example` cuando se definan las variables necesarias.

## Pruebas

Cada tarea sigue el flujo de pruebas primero, implementación y revisión contra `Docs/spec.md` y `Docs/plan.md`. En el backend, `npm test` ejecuta Vitest con Supertest.

## Entrega

La clase 10 requiere una aplicación accesible por internet, repositorio público, README e informe con el plan y las pruebas. El enlace de la aplicación se añadirá cuando se publique.
