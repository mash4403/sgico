# SGICO — Guía de Setup Paso a Paso

## Prerequisitos
- Cuenta de GitHub (ya la tienes)
- Node.js v18+ instalado ([descargar](https://nodejs.org))
- Git instalado

---

## Paso 1: Crear proyecto en Supabase (5 minutos)

1. Ir a [https://supabase.com](https://supabase.com)
2. Crear cuenta con GitHub
3. Click "New Project"
4. Configurar:
   - **Name**: `sgico`
   - **Database Password**: generar una segura y guardarla
   - **Region**: South America (São Paulo) — la más cercana a Colombia
5. Esperar ~2 minutos a que se cree

### Obtener credenciales
1. En tu proyecto → **Settings** → **API**
2. Copiar:
   - **Project URL** (ej: `https://abc123.supabase.co`)
   - **anon public key** (ej: `eyJhbGciOi...`)

---

## Paso 2: Crear la base de datos (3 minutos)

1. En Supabase → **SQL Editor**
2. Click "New Query"
3. Pegar el contenido de `database/migrations/001_initial_schema.sql`
4. Click **Run** (▶)
5. Debería ejecutar sin errores
6. Repetir con `database/seeds/001_catalogos.sql`

### Verificar
- Ir a **Table Editor** — deberías ver todas las tablas creadas
- Las tablas `sedes`, `eps`, `protocolos` deberían tener datos

---

## Paso 3: Crear repo en GitHub (2 minutos)

1. Ir a [github.com/new](https://github.com/new)
2. Nombre: `sgico`
3. Privado
4. NO inicializar con README (ya lo tenemos)

```bash
# En tu terminal, dentro de la carpeta del proyecto:
git init
git add .
git commit -m "feat: MVP inicial SGICO"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/sgico.git
git push -u origin main
```

---

## Paso 4: Configurar variables de entorno (1 minuto)

```bash
# Copiar el template
cp .env.example .env

# Editar .env con tus credenciales de Supabase
# VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
# VITE_SUPABASE_ANON_KEY=tu-anon-key
```

---

## Paso 5: Instalar y ejecutar (2 minutos)

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

### Crear tu primer usuario
1. En la pantalla de login, click "¿Primera vez? Crear cuenta"
2. Usar tu email institucional
3. Confirmar email (revisar bandeja de entrada o spam)

---

## Paso 6: Deploy en Vercel (5 minutos)

1. Ir a [vercel.com](https://vercel.com)
2. Crear cuenta con GitHub
3. Click "New Project" → Importar el repo `sgico`
4. En **Environment Variables**, agregar:
   - `VITE_SUPABASE_URL` = tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
5. Click **Deploy**

Tu app estará en `https://sgico-xxxxx.vercel.app`

---

## Paso 7: Migrar datos del Excel (10 minutos)

```bash
# Instalar dependencias Python
pip install pandas openpyxl supabase python-dotenv

# Primero simular (no escribe nada)
python scripts/migrate_excel.py --file "tu_excel.xlsx" --dry-run

# Si todo se ve bien, migrar de verdad
python scripts/migrate_excel.py --file "tu_excel.xlsx"
```

---

## Paso 8: Configurar CI/CD (3 minutos)

En GitHub → tu repo → **Settings** → **Secrets and variables** → **Actions**

Agregar estos secrets:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VERCEL_TOKEN` (obtener en vercel.com → Settings → Tokens)
- `VERCEL_ORG_ID` (en .vercel/project.json después del primer deploy)
- `VERCEL_PROJECT_ID` (mismo archivo)

---

## Workflow de desarrollo diario

```bash
# 1. Crear rama para nueva funcionalidad
git checkout -b feature/nombre-feature

# 2. Hacer cambios y probar local
npm run dev

# 3. Commit y push
git add .
git commit -m "feat: descripción del cambio"
git push origin feature/nombre-feature

# 4. Crear Pull Request en GitHub
# 5. CI corre automáticamente (lint + build)
# 6. Merge a main → Deploy automático a Vercel
```

---

## Troubleshooting

### "No se conecta a Supabase"
- Verificar que `.env` tiene las credenciales correctas
- Verificar que no hay espacios en las variables

### "Error al crear tablas"
- Ejecutar la migración completa, no por partes
- Si ya existen tablas, borrarlas primero con `DROP TABLE IF EXISTS ... CASCADE`

### "Login no funciona"
- En Supabase → Auth → Settings → verificar que Email auth está habilitado
- Para desarrollo, desactivar "Confirm email" en Auth settings

### "No se ven datos en el dashboard"
- Verificar que hay datos en las tablas (Table Editor en Supabase)
- Verificar que las vistas SQL se crearon correctamente
- Las vistas de Supabase se acceden como tablas en el cliente
