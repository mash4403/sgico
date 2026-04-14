// ============================================================
// SGICO — Script de carga de datos desde Excel a Supabase
// Archivo: scripts/import_excel.js
// Uso: node scripts/import_excel.js ruta/al/archivo.xlsx
// Requiere: npm install xlsx @supabase/supabase-js dotenv
// ============================================================

import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'

config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// ── Utilidades ──────────────────────────────────────────────

const log  = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`)
const warn = (msg) => console.warn(`\x1b[33m⚠\x1b[0m ${msg}`)
const err  = (msg) => console.error(`\x1b[31m✗\x1b[0m ${msg}`)

function readSheet(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) { warn(`Hoja "${name}" no encontrada`); return [] }
  // fila 0 = grupos, fila 1 = headers, fila 2 = notas → datos desde fila 3
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headers = rows[1]?.map(h => h?.toString().replace(' *','').trim()) || []
  return rows.slice(3)
    .filter(r => r.some(c => c !== null && c !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])))
}

function bool(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'boolean') return val
  return String(val).toUpperCase() === 'TRUE'
}

function num(val) {
  if (val === null || val === '') return null
  const n = parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function date(val) {
  if (!val) return null
  if (typeof val === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val)
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

async function upsert(table, rows, onConflict) {
  if (!rows.length) { warn(`Sin datos para ${table}`); return [] }
  const { data, error } = await supabase
    .from(table)
    .upsert(rows, { onConflict, ignoreDuplicates: false })
    .select()
  if (error) throw new Error(`${table}: ${error.message}`)
  log(`${table}: ${data.length} registros insertados/actualizados`)
  return data
}

// ── Catálogos lookup ────────────────────────────────────────

async function buildLookup(table, keyField) {
  const { data, error } = await supabase.from(table).select(`id, ${keyField}`)
  if (error) throw new Error(`Lookup ${table}: ${error.message}`)
  return Object.fromEntries(data.map(r => [r[keyField]?.trim()?.toLowerCase(), r.id]))
}

// ── Pasos de importación ────────────────────────────────────

async function importSedes(wb) {
  const rows = readSheet(wb, 'SEDES').map(r => ({
    nombre: r.nombre?.trim(),
    ciudad: r.ciudad?.trim() || 'Medellín',
    activa: bool(r.activa) ?? true,
  })).filter(r => r.nombre)
  return upsert('sedes', rows, 'nombre')
}

async function importEps(wb) {
  const rows = readSheet(wb, 'EPS').map(r => ({
    nombre: r.nombre?.trim(),
    codigo: r.codigo?.trim() || null,
    activa: bool(r.activa) ?? true,
  })).filter(r => r.nombre)
  return upsert('eps', rows, 'nombre')
}

async function importMedicos(wb, sedeLookup) {
  const rows = readSheet(wb, 'MEDICOS').map(r => {
    const sedeId = sedeLookup[r.sede?.trim()?.toLowerCase()]
    if (!sedeId) warn(`Médico "${r.nombre}": sede "${r.sede}" no encontrada`)
    return {
      nombre: r.nombre?.trim(),
      especialidad: r.especialidad?.trim() || null,
      registro_medico: r.registro_medico?.trim() || null,
      sede_id: sedeId || null,
      activo: bool(r.activo) ?? true,
    }
  }).filter(r => r.nombre)
  return upsert('medicos', rows, 'nombre')
}

async function importGestores(wb) {
  const rows = readSheet(wb, 'GESTORES').map(r => ({
    nombre: r.nombre?.trim(),
    email: r.email?.trim() || null,
    rol: r.rol?.trim() || 'gestor_seguimiento',
    activo: bool(r.activo) ?? true,
  })).filter(r => r.nombre)
  return upsert('gestores', rows, 'nombre')
}

async function importProtocolos(wb) {
  const rows = readSheet(wb, 'PROTOCOLOS').map(r => ({
    nombre: r.nombre?.trim(),
    cie10: r.cie10?.trim() || null,
    diagnostico: r.diagnostico?.trim() || null,
    linea_tratamiento: num(r.linea_tratamiento),
    regimen_estandar: r.regimen_estandar?.trim() || null,
    pfs_esperado_meses: num(r.pfs_esperado_meses),
    os_esperado_meses: num(r.os_esperado_meses),
    estudio_pivotal: r.estudio_pivotal?.trim() || null,
    referencia: r.referencia?.trim() || null,
    requiere_comite: bool(r.requiere_comite) ?? true,
    activo: bool(r.activo) ?? true,
  })).filter(r => r.nombre)
  return upsert('protocolos', rows, 'nombre')
}

async function importCasos(wb, lookups) {
  const { sedes, eps, medicos, protocolos } = lookups
  const rows = readSheet(wb, 'CASOS_COMITE')
  let insertados = 0
  let errores = 0

  for (const r of rows) {
    try {
      // 1. Crear o reutilizar paciente
      const docKey = r.documento?.toString().trim()
      if (!docKey) { warn('Fila sin documento, omitida'); continue }

      let pacienteId
      const { data: pacExist } = await supabase
        .from('pacientes').select('id')
        .eq('documento', docKey)
        .eq('tipo_documento', r.tipo_documento?.trim() || 'CC')
        .single()

      if (pacExist) {
        pacienteId = pacExist.id
      } else {
        const { data: newPac, error: pacErr } = await supabase
          .from('pacientes')
          .insert({
            tipo_documento: r.tipo_documento?.trim() || 'CC',
            documento: docKey,
            nombre: r.nombre_paciente?.trim(),
            genero: r.genero?.trim() || null,
            fecha_nacimiento: date(r.fecha_nacimiento),
            telefono1: r.telefono?.toString().trim() || null,
            eps_id: eps[r.eps?.trim()?.toLowerCase()] || null,
            sede_id: sedes[r.sede?.trim()?.toLowerCase()] || null,
          })
          .select().single()
        if (pacErr) throw new Error(`Paciente: ${pacErr.message}`)
        pacienteId = newPac.id
      }

      // 2. Crear diagnóstico
      const { data: dx, error: dxErr } = await supabase
        .from('diagnosticos')
        .insert({
          paciente_id: pacienteId,
          cie10: r.cie10?.trim(),
          descripcion: r.diagnostico?.trim() || null,
          estadio: r.estadio?.trim() || null,
          histologia: r.histologia?.trim() || null,
          ecog: num(r.ecog),
          metastasis_sitios: r.metastasis_sitios?.trim() || null,
          fecha_diagnostico: date(r.fecha_solicitud),
        })
        .select().single()
      if (dxErr) throw new Error(`Diagnóstico: ${dxErr.message}`)

      // 3. Crear caso comité
      const { error: casoErr } = await supabase
        .from('casos_comite')
        .insert({
          paciente_id: pacienteId,
          diagnostico_id: dx.id,
          medico_id: medicos[r.medico_solicitante?.trim()?.toLowerCase()] || null,
          sede_id: sedes[r.sede?.trim()?.toLowerCase()] || null,
          fecha_solicitud: date(r.fecha_solicitud),
          tipo_comite: r.tipo_comite?.trim() || 'tumor_solido',
          motivo: r.motivo_presentacion?.trim() || '',
          linea_actual: num(r.linea_actual),
          linea_propuesta: num(r.linea_propuesta),
          molecula_propuesta: r.molecula_propuesta?.trim() || null,
          justificacion: r.justificacion?.trim() || null,
          tiene_invima: bool(r.tiene_invima) ?? false,
          en_unirse: bool(r.en_unirse) ?? false,
          protocolo_id: protocolos[r.protocolo_asociado?.trim()?.toLowerCase()] || null,
          presentacion_obligatoria: bool(r.presentacion_obligatoria) ?? false,
          tratamiento_previo: r.tratamiento_previo?.trim() || null,
          molecula_previa: r.molecula_previa?.trim() || null,
          costo_previo: num(r.costo_previo) || 0,
          valoracion_psicosocial: bool(r.valoracion_psicosocial) ?? false,
          fecha_presentacion: date(r.fecha_presentacion),
          decision: r.decision?.trim() || 'pendiente',
          molecula_aprobada: r.molecula_aprobada?.trim() || null,
          costo_molecula_aprobada: num(r.costo_molecula_aprobada) || 0,
          costo_post: num(r.costo_post) || 0,
          adherente_protocolo: bool(r.adherente_protocolo),
          motivo_no_adherencia: r.motivo_no_adherencia?.trim() || null,
          estado: r.estado_caso?.trim() || 'activo',
          motivo_cancelacion: r.motivo_cancelacion?.trim() || null,
        })
      if (casoErr) throw new Error(`Caso: ${casoErr.message}`)
      insertados++
    } catch (e) {
      err(`Caso doc=${r.documento}: ${e.message}`)
      errores++
    }
  }
  log(`casos_comite: ${insertados} insertados, ${errores} errores`)
}

async function importDesenlaces(wb, lookups) {
  const { pacientes, protocolos } = lookups
  const rows = readSheet(wb, 'DESENLACES')
  let insertados = 0
  let errores = 0

  for (const r of rows) {
    try {
      const docKey = r.documento?.toString().trim()
      if (!docKey) continue

      // Buscar caso asociado
      const pacId = pacientes[docKey]
      if (!pacId) { warn(`Desenlace doc=${docKey}: paciente no encontrado`); continue }

      const { data: caso } = await supabase
        .from('casos_comite')
        .select('id')
        .eq('paciente_id', pacId)
        .order('created_at', { ascending: false })
        .limit(1).single()

      const { error: dErr } = await supabase.from('desenlaces').insert({
        paciente_id: pacId,
        caso_id: caso?.id || null,
        protocolo_id: protocolos[r.protocolo_asociado?.trim()?.toLowerCase()] || null,
        mejor_respuesta: r.mejor_respuesta?.trim() || null,
        fecha_mejor_respuesta: date(r.fecha_mejor_respuesta),
        fecha_inicio_tx: date(r.fecha_inicio_tratamiento),
        fecha_progresion: date(r.fecha_progresion),
        pfs_meses: num(r.pfs_meses),
        evento_pfs: bool(r.evento_pfs) ?? false,
        fecha_muerte: date(r.fecha_muerte),
        os_meses: num(r.os_meses),
        evento_os: bool(r.evento_os) ?? false,
        causa_muerte: r.causa_muerte?.trim() || null,
        toxicidad_max: num(r.toxicidad_grado_max),
        toxicidad_descripcion: r.toxicidad_descripcion?.trim() || null,
        suspension_toxicidad: bool(r.suspension_por_toxicidad) ?? false,
        pfs_esperado: num(r.pfs_esperado_estudio),
        os_esperado: num(r.os_esperado_estudio),
        avac_estimado: num(r.avac_estimado),
        costo_total: num(r.costo_total_tratamiento),
        costo_avac: num(r.costo_por_avac),
        estado_vital: r.estado_vital?.trim() || 'vivo',
        fecha_ultimo_contacto: date(r.fecha_ultimo_contacto),
      })
      if (dErr) throw new Error(dErr.message)
      insertados++
    } catch (e) {
      err(`Desenlace doc=${r.documento}: ${e.message}`)
      errores++
    }
  }
  log(`desenlaces: ${insertados} insertados, ${errores} errores`)
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    err('Uso: node scripts/import_excel.js ruta/al/archivo.xlsx')
    process.exit(1)
  }

  console.log('\n📂 Leyendo archivo:', filePath)
  const wb = XLSX.read(readFileSync(resolve(filePath)), { type: 'buffer', cellDates: false })
  console.log('   Hojas encontradas:', wb.SheetNames.join(', '))

  console.log('\n🚀 Iniciando importación...\n')

  try {
    // 1. Catálogos base
    await importSedes(wb)
    await importEps(wb)

    // 2. Construir lookups
    const sedes     = await buildLookup('sedes', 'nombre')
    const eps       = await buildLookup('eps', 'nombre')

    await importMedicos(wb, sedes)
    await importGestores(wb)
    await importProtocolos(wb)

    const medicos   = await buildLookup('medicos', 'nombre')
    const protocolos = await buildLookup('protocolos', 'nombre')

    // 3. Casos
    await importCasos(wb, { sedes, eps, medicos, protocolos })

    // 4. Desenlaces (requiere pacientes ya insertados)
    const { data: pacData } = await supabase.from('pacientes').select('id, documento')
    const pacientes = Object.fromEntries(pacData.map(p => [p.documento, p.id]))
    await importDesenlaces(wb, { pacientes, protocolos })

    console.log('\n✅ Importación completada exitosamente\n')
  } catch (e) {
    err(`Error fatal: ${e.message}`)
    process.exit(1)
  }
}

main()
