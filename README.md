# SGICO — Sistema de Gestión Inteligente del Comité Oncológico

## Problema
El comité de tumores toma decisiones clínicas y administrativas sin un sistema que permita hacer seguimiento, medir impacto, comparar desenlaces con evidencia pivotal ni evaluar adherencia a protocolos institucionales.

## Solución
Plataforma web que estructura el registro, automatiza seguimientos, genera KPIs/KOR en tiempo real y habilita investigación clínica con datos de vida real (RWD).

---

## Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Base de datos | PostgreSQL (Supabase) | Relacional, gratis, API automática |
| Backend/API | Supabase (auto-generated REST + Auth) | Zero backend code para MVP |
| Frontend | React + Vite | Rápido, moderno, desplegable gratis |
| Estilos | Tailwind CSS | Desarrollo ágil |
| CI/CD | GitHub Actions | Integrado con el repo |
| Deploy | Vercel | Free tier, deploy automático |

## Metodología Ágil — Pipeline CI/CD

```
Feature Branch → Pull Request → CI (lint + test) → Review → Merge → CD (auto-deploy)
```

### Sprints definidos

| Sprint | Duración | Entregable |
|--------|----------|------------|
| **S1: MVP Core** | 2 semanas | Schema + Auth + Registro de casos + Dashboard básico |
| **S2: Seguimiento** | 2 semanas | Sistema de seguimientos + Alertas automatizadas |
| **S3: Económico** | 2 semanas | Módulo de costos + Análisis antes/después |
| **S4: Outcomes** | 2 semanas | Desenlaces clínicos + Comparación vs evidencia pivotal |
| **S5: Reportes** | 1 semana | Exportación + Reportes PDF + Auditoría |

---

## Setup Rápido

### 1. Supabase
```bash
# Crear cuenta en https://supabase.com (gratis)
# Crear nuevo proyecto
# Copiar URL y ANON KEY
```

### 2. Variables de entorno
```bash
cp .env.example .env
# Editar con tus credenciales de Supabase
```

### 3. Base de datos
```bash
# En Supabase SQL Editor, ejecutar:
# database/migrations/001_initial_schema.sql
# database/seeds/001_catalogos.sql
```

### 4. Frontend
```bash
npm install
npm run dev
```

### 5. Deploy
```bash
# Push a main → Vercel despliega automáticamente
git push origin main
```

---

## 🛠️ Mantenimiento

> Operaciones que se ejecutan en **Supabase → SQL Editor** (corre con privilegios
> que ignoran RLS). Úsalas con cuidado: escriben sobre datos reales.

### Reset de datos de prueba (borrar todos los casos)

Deja los catálogos (`sedes`, `eps`, `medicos`, `gestores`, `protocolos`) y los
`pacientes` intactos; solo elimina los casos y todo lo que cuelga de ellos.

Dos detalles del esquema hacen que un `delete from casos_comite` directo **falle**:

1. **`desenlaces.caso_id` es `NO ACTION`** (no CASCADE) → hay que borrarlo antes.
2. Un trigger de auditoría (`fn_log_caso_cambio`) intenta registrar el borrado en
   `casos_historial`, pero su FK exige que el caso aún exista → viola la FK. Se
   desactivan los triggers de usuario durante el borrado (la integridad
   referencial/CASCADE se conserva, porque son triggers internos).

```sql
begin;

alter table casos_comite disable trigger user;

-- desenlaces es NO ACTION: va primero
delete from desenlaces where caso_id in (select id from casos_comite);

-- el resto (alertas, medicamentos, seguimientos, casos_historial, actas_comite)
-- se limpia solo por CASCADE al borrar el caso
delete from casos_comite;

alter table casos_comite enable trigger user;   -- ⚠️ no olvidar reactivar

commit;

-- verificación
select count(*) from casos_comite;   -- debe dar 0
```

> Si el error se mueve a otra tabla (un trigger de auditoría similar en una tabla
> hija al borrarse por cascade), añade `alter table <tabla> disable trigger user;`
> para esa tabla. La transacción revierte ante cualquier fallo, así que es seguro
> reintentar.

### Descubrir dependencias de una tabla (FKs)

Antes de borrar en cascada, ver qué tablas la referencian y con qué regla:

```sql
select tc.table_name as tabla_hija, kcu.column_name as columna_fk, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu       on tc.constraint_name = kcu.constraint_name
join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
join information_schema.constraint_column_usage ccu on rc.unique_constraint_name = ccu.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'casos_comite';
```

### ⚠️ Deuda técnica conocida

El trigger `fn_log_caso_cambio()` registra la acción `'eliminar'` en `casos_historial`
con FK a `casos_comite`, lo que hace **imposible borrar un caso** por vías normales.
Arreglo pendiente: que `casos_historial.caso_id` sea `ON DELETE CASCADE`, o que el
trigger no registre deletes (o los registre en una tabla sin FK al caso).

---

## Estructura del proyecto

```
sgico/
├── .github/workflows/    # CI/CD pipelines
├── database/
│   ├── migrations/       # Schema SQL versionado
│   └── seeds/            # Datos iniciales (sedes, EPS, protocolos)
├── src/
│   ├── components/       # Componentes reutilizables
│   ├── pages/            # Páginas principales
│   ├── lib/              # Supabase client, utilidades
│   └── hooks/            # Custom React hooks
├── scripts/              # Migración de Excel, utilidades
├── docs/                 # Documentación técnica
└── public/               # Assets estáticos
```

## Licencia
Uso interno institucional.
