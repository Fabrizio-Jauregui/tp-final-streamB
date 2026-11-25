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

## Base de datos y migraciones

El ejecutor de migraciones usa `DATABASE_URL` explícitamente. En PowerShell, configura la conexión a tu instancia PostgreSQL antes de migrar:

```powershell
$env:DATABASE_URL = "postgresql://usuario:clave@localhost:5432/base"
npm run db:migrate
npm run db:rollback
```

Reemplaza los valores de ejemplo por los de tu base. Los tests de migraciones no leen `DATABASE_URL`: levantan una base PostgreSQL aislada en memoria y la cierran al terminar. Las pruebas de concurrencia posteriores también se ejecutarán contra PostgreSQL nativo.

## Variables de entorno

`DATABASE_URL` se proporciona en el entorno al ejecutar las migraciones. El backend no carga `.env` automáticamente. Mantén credenciales reales fuera de Git y configúralas localmente o en el proveedor de despliegue.

## Pruebas

Cada tarea sigue el flujo de pruebas primero, implementación y revisión contra `Docs/spec.md` y `Docs/plan.md`. En el backend, `npm test` ejecuta Vitest, Supertest y las pruebas PostgreSQL aisladas con PGlite.

## Entrega

La clase 10 requiere una aplicación accesible por internet, repositorio público, README e informe con el plan y las pruebas. El enlace de la aplicación se añadirá cuando se publique.
