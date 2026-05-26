# Handoff — SGICO

> Documento para retomar el trabajo en otra sesión de Claude Code.
> Última actualización: 2026-05-10. Rama: `main`.

## Contexto rápido

SGICO = Sistema de Gestión del Comité Oncológico. Stack: React + Vite (frontend), Supabase (BD/Auth), Tailwind. Ver [README.md](README.md) para el panorama del proyecto.

Páginas principales:
- [src/pages/PresentacionComite.jsx](src/pages/PresentacionComite.jsx) — formulario multipaso (10 pasos) para inscribir casos al comité
- [src/pages/CasoDetalle.jsx](src/pages/CasoDetalle.jsx) — vista de un caso
- [src/pages/Casos.jsx](src/pages/Casos.jsx), [Dashboard.jsx](src/pages/Dashboard.jsx), [Seguimientos.jsx](src/pages/Seguimientos.jsx), [Login.jsx](src/pages/Login.jsx)

Migraciones en [database/migrations/](database/migrations/) y seeds en [database/seeds/](database/seeds/).

## Qué se hizo en esta sesión (2026-05-10)

Cuatro ajustes clínicos al formulario del comité. **Los 4 cambios ya están en código** — los tres últimos venían del commit anterior `9ffed19`, en esta sesión sólo se cerró el ajuste 1 + un fix derivado.

### Ajustes aplicados

1. **Sedes reales (Valle, Tolima, Cauca)** — esta sesión, commit `114206e`
   - [database/migrations/003_sedes_reales.sql](database/migrations/003_sedes_reales.sql): inserción idempotente (`WHERE NOT EXISTS`) + desactivación de las sedes ficticias antiguas (`Sede Principal/Sur/Norte`) sin borrarlas para no romper FK de casos históricos.
   - [src/pages/PresentacionComite.jsx:131](src/pages/PresentacionComite.jsx#L131): el `select` de sedes ahora filtra por `activa = true` (los demás catálogos ya lo hacían, sedes era el outlier).

2. **Tratamientos previos reorganizados** — commit `9ffed19` (previo)
   - `molecula_previa` → renombrado en UI a "Tratamiento actual" ([PresentacionComite.jsx:909](src/pages/PresentacionComite.jsx#L909))
   - Nuevo campo único "Quimioterapia y líneas previas" (texto multi-línea) que reemplaza el separado de QT previa ([PresentacionComite.jsx:921](src/pages/PresentacionComite.jsx#L921))
   - Estructura visual con 3 sub-secciones: Situación actual / Tratamientos previos / Otras modalidades.

3. **PFS y OS del tratamiento actual con "No aplica"** — commit `9ffed19`
   - Botón "No aplica" en `pfs_actual_meses` y `os_actual_meses` ([PresentacionComite.jsx:1088-1101](src/pages/PresentacionComite.jsx#L1088-L1101))
   - Si PFS actual = "No aplica" ⇒ `es_naive = true` ⇒ no se calcula diferencial.

4. **Cálculo de proyección sólo por PFS** — commit `9ffed19`
   - [PresentacionComite.jsx:474-549](src/pages/PresentacionComite.jsx#L474-L549) (`calcularProyeccion`): sólo computa diferencia hasta progresión (PFS) y costo por mes ganado de PFS. OS queda atenuado como referencia clínica.
   - Misma lógica reflejada en [CasoDetalle.jsx:398-483](src/pages/CasoDetalle.jsx#L398-L483) (`ProyeccionCostosSection`).

## Mapeo importante: form ↔ BD

El schema **no cambió**. Para preservar compatibilidad con casos viejos se reutilizaron columnas:

| Campo del formulario nuevo | Columna en `casos_comite` |
|---|---|
| `tratamiento_actual` (UI) | `molecula_previa` (BD) |
| `quimioterapia_lineas_previas` (UI) | `tratamiento_qt` (BD) |

Si alguien intenta "limpiar" el código renombrando columnas, primero confirmar que no rompe casos históricos.

## Estado del repo (al cerrar sesión)

```
Rama: main
Adelante de origin/main por 2 commits
Untracked: .claude/ (config local de Claude Code, no debe entrar al repo)
```

Commits recientes:
- `114206e` feat(sedes): cargar Valle/Tolima/Cauca y desactivar sedes antiguas ← esta sesión
- `9ffed19` Refactor treatment data structure and update projections in CasoDetalle and PresentacionComite
- `336c488` feat: add cost projection step and enhance cost input fields

Build verificado: `npx vite build` ✓ pasa limpio (2352 módulos, ~4s).

## Pendiente

1. **Correr la migración 003 en Supabase** — todavía NO se ha ejecutado en la BD remota. Pegar [database/migrations/003_sedes_reales.sql](database/migrations/003_sedes_reales.sql) en SQL Editor → Run. Mensajes esperados:
   ```
   NOTICE: Sedes existentes antes de la migración: 3
   NOTICE: Total de sedes ahora: 6
   NOTICE: Valle: 1 | Tolima: 1 | Cauca: 1
   NOTICE: Sedes viejas desactivadas: 3
   ```
2. **Push a `origin/main`** cuando el usuario lo pida (2 commits locales pendientes).
3. **Verificar en `/presentar`** que el selector de sede sólo muestra Valle/Tolima/Cauca tras correr la migración.

## Cómo arrancar localmente

```bash
npm install
npm run dev          # vite dev server (default :3001)
npx vite build       # verificación rápida; no usar `npm run lint` (falta dep eslint-plugin-react-hooks)
```

## Convenciones observadas en este repo

- Migraciones numeradas consecutivas en `database/migrations/NNN_descripcion.sql`. Esta sesión usó `003` (la siguiente disponible).
- Cada migración es **idempotente**: `IF NOT EXISTS`, `WHERE NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
- Catálogos (sedes, EPS, médicos, gestores, protocolos) tienen flag `activa`/`activo` y se filtran en las queries del frontend.
- Constantes `NA = '__NA__'` para marcar "No aplica" en campos del formulario — se traduce a string `'No aplica'` al guardar ([clean()](src/pages/PresentacionComite.jsx#L558)).
- Borradores del formulario en `localStorage` con key `sgico_presentacion_draft`.

## Para el próximo Claude

- El usuario escribe en español, prefiere respuestas concisas, **pide confirmación antes de commits**.
- Cuando una migración SQL cambie catálogos (insertar/desactivar), revisar si la query del frontend filtra por `activa = true`. Esta sesión se descubrió el outlier de `sedes` por esa misma razón.
- Hay carpeta `.claude/` local del usuario — no incluir en commits.
