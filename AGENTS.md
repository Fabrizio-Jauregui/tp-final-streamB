# Instrucciones del proyecto

## Fuente de verdad
- `Docs/spec.md` define el comportamiento requerido.
- `Docs/decisiones.md` registra decisiones de diseño; `Docs/plan.md` define la arquitectura aprobada; `Docs/tareas.md` organiza la implementación.
- Si una transcripción o consigna del curso cambia un requisito, actualizar primero los documentos y luego el código. No inventar reglas que no estén respaldadas.

## Roles de trabajo
- **Analista:** mantiene idea, decisiones, glosario, preguntas y spec; no programa.
- **Arquitecto:** mantiene el plan técnico y el orden/dependencias de tareas; no cambia reglas de negocio unilateralmente.
- **Backend:** implementa API y persistencia conforme a plan/spec.
- **Frontend:** implementa interfaz y consumo de API conforme a spec.
- **Tester:** escribe pruebas desde criterios de aceptación y reglas antes de implementar.
- **Revisor:** audita cambios contra spec y plan; no modifica código durante la revisión.

## Ciclo obligatorio por tarea
1. Elegir una tarea pendiente y confirmar que sus dependencias están completas.
2. El tester escribe y ejecuta pruebas derivadas de la historia, reglas y criterios de aceptación; las pruebas nuevas deben fallar antes de implementar.
3. El agente de desarrollo implementa el cambio mínimo para que pasen las pruebas. No modifica ni borra pruebas; si considera que una prueba contradice el spec, lo informa para revisión.
4. Ejecutar la suite afectada y revisar regresiones.
5. El revisor compara el cambio contra el spec y el plan, y emite aprobado/rechazado con hallazgos.
6. Corregir y repetir pruebas/revisión hasta aprobación.
7. Solo con pruebas aprobadas y revisión aprobada, crear commit y marcar la tarea como hecha en `Docs/tareas.md`.

## Cambios de alcance
Si aparece una regla o cambio de alcance, detener la tarea afectada y pedir al analista actualizar primero los documentos fuente. No resolver diferencias de negocio desde el código.
