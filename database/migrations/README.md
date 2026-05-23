# Migraciones de Base de Datos — SGICO

Este directorio contiene las migraciones SQL de la base de datos de SGICO.
La BD vive en Supabase (PostgreSQL 17).

## Modelo de versionado

El proyecto usa **baseline + migraciones incrementales**:

- **`001_baseline_schema.sql`** es la **fuente de verdad** del schema en producción.
  Es un `pg_dump --schema-only` capturado el 2026-05-19, ya limpio
  y listo para aplicar en cualquier entorno nuevo.
- **`002_*.sql`, `003_*.sql`, …** son cambios incrementales que se aplican
  *después* de la baseline. Algunas pueden ser **históricas** (ya absorbidas
  en la baseline) y se conservan como registro — están claramente marcadas
  en su encabezado.

### ¿Por qué hicimos baseline en lugar de seguir acumulando migraciones?

Cuando reconstruimos la línea de cambios del repo nos dimos cuenta de que
la BD de producción tenía evolución (campos, triggers, vistas, funciones)
que **no estaba versionada**: alguien aplicó SQL directamente en Supabase.
El repo había quedado desincronizado con la realidad.

En lugar de adivinar cuáles eran esos cambios y escribir migraciones
"ficticias", capturamos un dump del estado real y lo declaramos como
**punto cero**. Desde aquí, cualquier nuevo cambio entra como migración
versionada en orden numérico.

---

## Setup desde cero (entorno nuevo)

Para configurar la BD en un proyecto Supabase **vacío**:

```bash
# 1. Crear proyecto Supabase nuevo
# 2. Abrir SQL Editor
# 3. Pegar y ejecutar:
#    - 001_baseline_schema.sql
#    - ../seeds/001_catalogos.sql   (EPS, sedes, protocolos iniciales)
# 4. Aplicar migraciones siguientes en orden:
#    - 002_*.sql, 003_*.sql, etc.   (si están marcadas como activas;
#                                     las históricas SE SALTAN)
```

Tras esto, el frontend (`src/`) conecta sin más configuración.

---

## Aplicar cambios nuevos

1. Crear archivo `00N_descripcion_corta.sql` con N siendo el siguiente número.
2. Header recomendado:
   ```sql
   -- ============================================================
   -- SGICO: Migración 00N — <descripción>
   -- ============================================================
   -- Aplicar en: Supabase SQL Editor
   -- Requisitos: 001_baseline_schema.sql + migraciones previas
   -- Idempotente: sí (usa IF NOT EXISTS / DROP-ADD)
   -- ============================================================
   ```
3. Envolver en `BEGIN; ... COMMIT;` para que sea atómica.
4. Usar `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` para ser idempotente.
5. Ejecutar en Supabase → si pasa, commit del archivo al repo.

---

## Actualizar la baseline

Cuando el árbol de migraciones se vuelva demasiado largo (digamos >15
migraciones después del baseline), conviene **regenerar la baseline**:

```bash
PGPASSWORD='...' pg_dump \
  --schema-only --no-owner --no-privileges --no-comments \
  --schema=public \
  --host=aws-1-us-west-2.pooler.supabase.com \
  --port=5432 \
  --username=postgres.znnhvgrqdukfoylkczxj \
  --dbname=postgres \
  > database/migrations/001_baseline_schema_NUEVO.sql
```

Después:
1. Limpiar manualmente (quitar `\restrict`/`\unrestrict` de pg_dump 18+,
   ajustar `CREATE SCHEMA public` a `IF NOT EXISTS`).
2. Reemplazar el `001_baseline_schema.sql` viejo.
3. Mover migraciones absorbidas a `database/migrations/archive/` o
   marcarlas con header "histórica" como hicimos con la `002`.
4. Documentar la fecha del nuevo baseline en este README.

---

## Inventario actual

| Archivo | Tipo | Estado | Notas |
|---|---|---|---|
| `001_baseline_schema.sql` | Baseline | ✅ Activa | Schema completo a 2026-05-19 |
| `002_audit_refinements.sql` | Histórica | 📦 Ya absorbida en baseline | Solo registro de cambios |

---

## Estructura de la BD (resumen)

### Catálogos
`sedes`, `eps`, `medicos`, `gestores`, `protocolos`

### Dominio clínico
`pacientes`, `diagnosticos`, `casos_comite`, `medicamentos`, `seguimientos`, `desenlaces`

### Operacional
`alertas`, `casos_historial`

### Vistas KPI
- `vw_dashboard_general` — métricas globales para el dashboard
- `vw_kpi_mensual` — KPIs agregados por mes
- `vw_outcomes_vs_evidencia` — comparación de outcomes reales vs estudio pivotal
- `vw_seguimiento_economico` — costo acumulado por caso
- `vw_seguimientos_pendientes` — seguimientos en curso/vencidos

### Funciones / Triggers
- `update_updated_at()` — `BEFORE UPDATE` en pacientes y casos_comite
- `crear_seguimientos_auto()` — `AFTER INSERT/UPDATE` en casos_comite,
  programa 7 seguimientos automáticos cuando se aprueba el caso
- `fn_log_caso_cambio()` — `AFTER INSERT/UPDATE/DELETE` en casos_comite,
  registra cada cambio en casos_historial (con snapshot al crear,
  diff campo por campo al actualizar)
- `programar_siguiente_evaluacion()` — `AFTER UPDATE` en seguimientos,
  programa el siguiente trimestral cuando uno se marca realizado y
  actualiza el estado del caso según el estado clínico
- `marcar_seguimientos_vencidos()` — RPC que marca vencidos y crea alertas
  (sin trigger, se invoca desde el front al cargar la pantalla de seguimientos)

---

## Deuda técnica conocida

(documentada aquí para no perderla)

1. **RLS faltante en catálogos**: `sedes`, `eps`, `medicos`, `gestores`,
   `protocolos`, `diagnosticos` tienen política `auth_all` pero **sin
   `ENABLE ROW LEVEL SECURITY`** → la política no se aplica. Cualquiera
   puede leer/escribir sin auth. Aceptable por ahora porque son catálogos
   internos, pero conviene endurecer antes de producción multi-tenant.

2. **Índice duplicado**: `idx_historial_caso` e `idx_historial_caso_fecha`
   tienen la misma definición `(caso_id, created_at DESC)`. Eliminar uno
   ahorra espacio y reduce overhead de INSERT.

3. **`CHECK con NULL literal`** en `seguimientos_estado_clinico_check` y
   `seguimientos_respuesta_recist_check`: el `NULL::character varying`
   dentro del array es noop (NULL nunca matchea con `=`). La columna ya
   es nullable, así que NULL ya pasa. No rompe nada pero es ruido visual.

4. **`auth_all` permisiva**: la mayoría de tablas tienen
   `USING (true) WITH CHECK (true)` — cualquier usuario autenticado puede
   ver/modificar todo. Para multi-sede esto debe restringirse por sede.

Estas no se arreglan en esta tanda; se documentan para abordar después.
