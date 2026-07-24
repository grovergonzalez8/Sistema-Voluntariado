# ExecPlans

Un ExecPlan es un documento vivo y autocontenido para cambios que cruzan capas, incorporan infraestructura o requieren decisiones arquitectónicas.

## Requisitos

Crear el plan en `docs/exec-plans/NNNN-descripcion.md` antes del código o las migraciones. Debe incluir objetivo, estado inicial, alcance, fuera de alcance, decisiones, riesgos, fases, validaciones, criterios de aceptación, progreso, descubrimientos, decisiones durante la ejecución y resultado final.

Actualizarlo después de cada fase con evidencia real. Registrar bloqueos sin presentarlos como éxitos. Las decisiones no bloqueantes se resuelven de forma conservadora y se documentan; secretos, riesgo destructivo o pérdida de datos requieren detenerse.

## Cierre

Antes de marcarlo completado: revisar el diff, ejecutar verificaciones aplicables, incorporar revisiones especializadas, documentar validaciones no ejecutadas y enumerar commits o la secuencia recomendada si Git carece de identidad.
