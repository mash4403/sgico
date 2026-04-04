# SGICO — Plan de Sprints y Roadmap

## Metodología
- Sprints de 2 semanas
- Kanban en GitHub Projects
- CI/CD con GitHub Actions → Vercel
- Revisión al final de cada sprint

---

## Sprint 1: MVP Core (Semanas 1-2) ← ESTAMOS AQUÍ

### Objetivo
Sistema funcional mínimo para demostrar valor y solicitar recursos.

### Entregables
- [x] Schema PostgreSQL en Supabase
- [x] Auth (login/registro)
- [x] Registro de casos (formulario completo)
- [x] Lista de casos con búsqueda/filtros
- [x] Dashboard con KPIs básicos
- [x] Registro de decisiones del comité
- [x] CI/CD configurado
- [x] Script de migración de Excel

### KPIs que genera
- Total de casos registrados
- Oportunidad del comité (días solicitud → presentación)
- Distribución por estado
- Alertas activas

### Cómo demostrar valor
1. Migrar datos históricos del Excel
2. Mostrar el dashboard con datos reales
3. Comparar: "antes 30 min buscando en Excel, ahora 2 clicks"
4. Mostrar las alertas que el Excel nunca generó

---

## Sprint 2: Seguimiento Automatizado (Semanas 3-4)

### Entregables
- [x] Gestión de seguimientos (día 3, 8, 15)
- [ ] Auto-creación de seguimientos al aprobar caso
- [ ] Alertas automáticas por seguimientos vencidos
- [ ] Función programada (cron) para marcar vencidos
- [ ] Notificaciones por email (Supabase Edge Functions)
- [ ] Dashboard de seguimiento con métricas

### KPIs que genera
- Tasa de cumplimiento de seguimientos
- Tiempo comité → inicio de tratamiento
- Decisiones no ejecutadas (y motivos)

---

## Sprint 3: Módulo Económico (Semanas 5-6)

### Entregables
- [ ] Registro detallado de medicamentos (antes/después)
- [ ] Vista de análisis económico
- [ ] Comparación de costos por molécula
- [ ] Cálculo de ahorro acumulado
- [ ] Gráficos de tendencia de costos
- [ ] Exportar reporte económico a PDF

### KPIs que genera
- Ahorro acumulado
- Costo promedio por caso
- Distribución del uso racional (molécula aprobada vs propuesta)

---

## Sprint 4: Desenlaces y Evidencia (Semanas 7-8)

### Entregables
- [ ] Módulo de desenlaces clínicos (PFS, OS, respuesta)
- [ ] Registro de toxicidad
- [ ] Tabla de protocolos con datos de estudios pivotales
- [ ] Vista: Outcomes reales vs Evidencia pivotal
- [ ] Cálculo de AVAC estimado
- [ ] Cálculo de costo/AVAC
- [ ] Adherencia a protocolos institucionales

### KPIs que genera
- PFS y OS por protocolo (real-world)
- Delta PFS/OS vs estudio pivotal
- Costo por AVAC
- % adherencia a protocolo institucional

---

## Sprint 5: Reportes y Auditoría (Semana 9)

### Entregables
- [ ] Exportar datos a Excel limpio
- [ ] Generar reporte PDF ejecutivo
- [ ] Log de auditoría (quién hizo qué, cuándo)
- [ ] Roles y permisos (admin, médico, gestor)
- [ ] Vista de auditoría en tiempo real

---

## Post-MVP: Fase 2

### Con recursos aprobados
- [ ] App móvil (React Native)
- [ ] Integración con historia clínica
- [ ] Módulo de investigación (generación de cohortes, exportación para análisis estadístico)
- [ ] IA: predicción de costos por cohorte
- [ ] IA: detección de patrones en decisiones
- [ ] Multi-sede con consolidación
