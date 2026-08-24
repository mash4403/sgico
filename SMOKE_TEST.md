# SMOKE TEST — SGICO

Verificación rápida (~5 min) de que lo crítico funciona tras cada despliegue.
Correr en **ventana incógnita** para descartar cache (`Cmd+Shift+N`).

- **Producción:** https://sgico.vercel.app
- **Local:** http://localhost:3000 (`npm run dev`)

Si algo se ve viejo: `Cmd+Shift+R` (recarga fuerte) o incógnito nuevo.

---

## Checklist

| # | Acción | ✅ Debe pasar |
|---|---|---|
| 1 | Abrir la app | Login **oscuro**, símbolo **El Circuito** (rombo con nodos), botón *Ingresar* en pulso (verde-teal), wordmark `Nodo·via` |
| 2 | Ingresar con usuario válido | Entra al **Dashboard** (no se queda en login ni lanza error) |
| 3 | Ver Dashboard | Tarjetas con datos · sección **"Desenlace por paciente"** · menú izquierdo con **"Casos para comité"** |
| 4 | Presentar caso → *Antecedentes* | **ECOG** es selector **sin** "No aplica" y **obligatorio** |
| 5 | Paso *Tratamientos* | **"Contexto terapéutico"** = selector (Naive / Neoadyuvancia / Adyuvancia / líneas metastásicas), no un número |
| 6 | Contexto = **Naive** → paso *Costos* | Campos del tratamiento actual **bloqueados en gris** + nota azul de paciente naive |
| 7 | Paso *Estudios* | En Patología y Moleculares/NGS: **fecha arriba**, descripción abajo. **No** existe "fecha del último estudio" |
| 8 | Llenar Admin + Demográficos → **"Agendar para comité"** → crear sesión con fecha | Modal guarda y redirige a **Casos para comité** |
| 9 | En **Casos para comité** | La sesión aparece con su fecha y el caso; botones **Editar** y **Presentar** |
| 10 | **Editar** el caso agendado | Reabre el formulario **con los datos** (hidratación desde `borrador_data`) |
| 11 | **Presentar** → firmar el acta en la Mesa | El caso **sale de la agenda** y aparece en **Casos** |
| 12 | Menú → **Casos** | Lista carga · badges de decisión **luminosos** (aprobado/rechazado/modificado) · solo casos `presentado=true` |
| 13 | Dashboard → efectividad vs. estudio | Barras PFS/OS/ORR con color (pulso/bronce/rojo) · tabla por paciente **clickeable** → abre el caso |

---

## Criterio de aceptación

- **Todo verde** → deploy sano.
- **Falla 1 / 3 (login oscuro, "Casos para comité" ausente)** → casi siempre cache: `Cmd+Shift+R` o incógnito nuevo.
- **Falla al agendar/presentar con error de Supabase** → tema de datos/RLS o migración sin aplicar, no del deploy. Revisar que las migraciones estén corridas.

---

## Desplegar a producción

El auto-deploy desde GitHub **no está conectado** (pendiente: Vercel → Settings → Git).
Mientras tanto, desde la carpeta del proyecto:

```bash
npx vercel@latest --prod
```

El proyecto ya quedó *linked* a `miguels-projects/sgico`, así que no vuelve a preguntar.
Al terminar imprime `▲ Aliased https://sgico.vercel.app` → ahí quedó actualizado.

> Nota: las migraciones de BD (`database/migrations/*.sql`) se corren aparte en
> Supabase SQL Editor; el deploy no las aplica.
