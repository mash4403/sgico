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
