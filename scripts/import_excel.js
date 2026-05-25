// ============================================================
// SGICO — Script de carga desde Excel a Supabase (v2)
// Archivo: scripts/import_excel.js
// Uso:     node scripts/import_excel.js ruta/al/archivo.xlsx
// Requiere: npm install xlsx @supabase/supabase-js dotenv
//
// Mapea los 67 campos de SGICO_Plantilla_v2.xlsx al schema actual de la BD.
// Tolera vacíos: campos opcionales sin dato pasan como NULL.
// Aborta filas con error pero sigue con las demás (resumen al final).
// ============================================================

import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'

config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

// ── Utilidades de logging ────────────────────────────────────

const log  = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`)
const warn = (msg) => console.warn(`\x1b[33m⚠\x1b[0m ${msg}`)
const err  = (msg) => console.error(`\x1b[31m✗\x1b[0m ${msg}`)
const info = (msg) => console.log(`\x1b[36mℹ\x1b[0m ${msg}`)

// ── Lectura de hoja Excel (header en fila 1, ejemplo en fila 2, datos desde fila 3+) ──

function readSheet(wb, name, { skipExampleRow = false } = {}) {
  const ws = wb.Sheets[name]
  if (!ws) {
    warn(`Hoja "${name}" no encontrada`)
    return []
  }
  // Para CASOS_COMITE y DESENLACES: fila 1 = categoría, fila 2 = headers, fila 3 = ejemplo, fila 4+ = datos
  // Para catálogos (SEDES/EPS/MEDICOS/GESTORES/PROTOCOLOS): fila 1 = headers, fila 2 = ejemplo, fila 3+ = datos
  const hasCategoryRow = ['CASOS_COMITE', 'DESENLACES'].includes(name)
  const headerRow = hasCategoryRow ? 2 : 1
  const startDataRow = headerRow + (skipExampleRow ? 2 : 1)

  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (allRows.length < headerRow) return []

  const headers = allRows[headerRow - 1].map(h => h?.toString().trim())
  const dataRows = allRows.slice(startDataRow - 1)
    .filter(r => r.some(c => c !== null && c !== ''))

  return dataRows.map(r =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null]))
  )
}

// ── Conversores tolerantes ───────────────────────────────────

function asStr(val) {
  if (val === null || val === undefined || val === '') return null
  return String(val).trim() || null
}

function asInt(val) {
  if (val === null || val === '') return null
  const n = parseInt(String(val).replace(/[, ]/g, ''), 10)
  return isNaN(n) ? null : n
}

function asNum(val) {
  if (val === null || val === '') return null
  const n = parseFloat(String(val).replace(/[, ]/g, ''))
  return isNaN(n) ? null : n
}

function asBool(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'boolean') return val
  const s = String(val).trim().toUpperCase()
  if (s === 'TRUE' || s === 'SI' || s === 'SÍ' || s === '1') return true
  if (s === 'FALSE' || s === 'NO' || s === '0') return false
  return null
}

function asDate(val) {
  if (!val) return null
  // Excel serial date (número)
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(val).trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // YYYY-MM-DDTHH... (timestamp ISO) → solo fecha
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
  // dd/mm/yyyy
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  return null
}

// ── Catálogos lookup ────────────────────────────────────────

async function buildLookup(table, keyField) {
  const { data, error } = await supabase.from(table).select(`id, ${keyField}`)
  if (error) throw new Error(`Lookup ${table}: ${error.message}`)
  return Object.fromEntries(
    data
      .filter(r => r[keyField])
      .map(r => [r[keyField].trim().toLowerCase(), r.id])
  )
}

function lookupId(map, value, label, errors) {
  if (!value) return null
  const key = String(value).trim().toLowerCase()
  const id = map[key]
  if (!id) {
    errors.push(`${label} no encontrado: "${value}"`)
    return null
  }
  return id
}

// ── Importadores de catálogos ────────────────────────────────

async function importCatalog(wb, sheetName, table, mapper, conflictKey = null) {
  const rows = readSheet(wb, sheetName, { skipExampleRow: ['MEDICOS', 'GESTORES'].includes(sheetName) })
    .map(mapper)
    .filter(r => r && r.nombre)

  if (!rows.length) {
    warn(`${table}: sin filas para importar`)
    return
  }

  // upsert para no fallar si ya existen
  let resp
  if (conflictKey) {
    resp = await supabase.from(table).upsert(rows, { onConflict: conflictKey, ignoreDuplicates: true })
  } else {
    resp = await supabase.from(table).insert(rows, { count: 'exact' })
  }

  if (resp.error) {
    // Si es duplicado, no es fatal — solo informativo
    if (resp.error.code === '23505') {
      info(`${table}: algunos ya existen (skip)`)
    } else {
      throw new Error(`${table}: ${resp.error.message}`)
    }
  }
  log(`${table}: ${rows.length} filas procesadas`)
}

// ── Importador principal: CASOS_COMITE ───────────────────────

async function importCasos(wb, lookups) {
  const { sedes, eps, medicos, gestores, protocolos } = lookups
  const filas = readSheet(wb, 'CASOS_COMITE', { skipExampleRow: true })

  if (!filas.length) {
    warn('CASOS_COMITE: sin filas para importar')
    return
  }

  info(`CASOS_COMITE: ${filas.length} filas detectadas, procesando...`)

  let okCount = 0
  let errCount = 0
  const errores = []

  for (const [idx, r] of filas.entries()) {
    const filaNum = idx + 4 // fila Excel real (1=cat, 2=hdr, 3=ej, 4+=datos)
    const errorsFila = []

    try {
      // ─── 1. Validar campos obligatorios ─────────────────
      const obligatorios = {
        tipo_documento: r.tipo_documento,
        documento: r.documento,
        nombre_paciente: r.nombre_paciente,
        eps: r.eps,
        fecha_solicitud: r.fecha_solicitud,
        sede: r.sede,
        medico_solicitante: r.medico_solicitante,
        cie10: r.cie10,
        motivo_presentacion: r.motivo_presentacion,
      }
      for (const [k, v] of Object.entries(obligatorios)) {
        if (!v || String(v).trim() === '') {
          errorsFila.push(`falta ${k}`)
        }
      }
      if (errorsFila.length) {
        throw new Error(errorsFila.join('; '))
      }

      // ─── 2. Resolver lookups ────────────────────────────
      const sedeId    = lookupId(sedes,      r.sede,                'sede',     errorsFila)
      const epsId     = lookupId(eps,        r.eps,                 'eps',      errorsFila)
      const medicoId  = lookupId(medicos,    r.medico_solicitante,  'medico',   errorsFila)
      const gestorId  = lookupId(gestores,   r.gestor,              'gestor',   [])  // no es fatal
      const protoId   = lookupId(protocolos, r.protocolo_asociado,  'protocolo',[])  // no es fatal

      if (errorsFila.length) {
        throw new Error(errorsFila.join('; '))
      }

      // ─── 3. Upsert paciente ─────────────────────────────
      const docKey = String(r.documento).trim()
      const tipoDoc = asStr(r.tipo_documento) || 'CC'

      let pacienteId
      const { data: pacExist } = await supabase
        .from('pacientes')
        .select('id')
        .eq('documento', docKey)
        .eq('tipo_documento', tipoDoc)
        .maybeSingle()

      if (pacExist) {
        pacienteId = pacExist.id
      } else {
        const { data: nuevo, error: pErr } = await supabase
          .from('pacientes')
          .insert({
            tipo_documento: tipoDoc,
            documento: docKey,
            nombre: asStr(r.nombre_paciente),
            genero: asStr(r.genero),
            fecha_nacimiento: asDate(r.fecha_nacimiento),
            telefono1: asStr(r.telefono),
            eps_id: epsId,
            sede_id: sedeId,
          })
          .select('id')
          .single()
        if (pErr) throw new Error(`paciente: ${pErr.message}`)
        pacienteId = nuevo.id
      }

      // ─── 4. Crear diagnóstico ───────────────────────────
      const { data: diag, error: dErr } = await supabase
        .from('diagnosticos')
        .insert({
          paciente_id: pacienteId,
          cie10: asStr(r.cie10),
          descripcion: asStr(r.diagnostico_descripcion),
          estadio: asStr(r.estadio_clinico),
          histologia: asStr(r.histologia),
          ecog: asInt(r.ecog),
          fecha_diagnostico: asDate(r.fecha_diagnostico),
        })
        .select('id')
        .single()
      if (dErr) throw new Error(`diagnostico: ${dErr.message}`)

      // ─── 5. Insertar caso_comite con TODOS los campos ───
      const casoPayload = {
        // Relacionales
        paciente_id: pacienteId,
        diagnostico_id: diag.id,
        medico_id: medicoId,
        sede_id: sedeId,
        gestor_id: gestorId,
        protocolo_id: protoId,

        // Comité administrativo
        fecha_solicitud: asDate(r.fecha_solicitud),
        fecha_presentacion: asDate(r.fecha_presentacion),
        tipo_comite: asStr(r.tipo_comite) || 'tumor_solido',
        prioridad: asStr(r.prioridad) || 'normal',

        // Diagnóstico (snapshot en caso)
        diagnostico_descripcion: asStr(r.diagnostico_descripcion),
        histologia: asStr(r.histologia),
        estadio_clinico: asStr(r.estadio_clinico),
        tnm: asStr(r.tnm),
        fecha_diagnostico: asDate(r.fecha_diagnostico),
        biomarcadores: asStr(r.biomarcadores),

        // Estado funcional
        ecog: asStr(r.ecog), // varchar(2) en BD, mantener como string
        comorbilidades: asStr(r.comorbilidades),
        alergias: asStr(r.alergias),
        habito_tabaquico: asStr(r.habito_tabaquico),
        habito_alcohol: asStr(r.habito_alcohol),
        medicacion_actual: asStr(r.medicacion_actual),

        // Estudios
        estudios_imagenes: asStr(r.estudios_imagenes),
        estudios_laboratorio: asStr(r.estudios_laboratorio),
        estudios_patologia: asStr(r.estudios_patologia),
        estudios_moleculares: asStr(r.estudios_moleculares),
        fecha_ultimo_estudio: asDate(r.fecha_ultimo_estudio),

        // Tratamientos previos
        linea_actual: asInt(r.linea_actual),
        tratamiento_previo: asStr(r.tratamiento_previo),
        molecula_previa: asStr(r.molecula_previa),
        costo_previo: asNum(r.costo_previo) ?? 0,
        tratamiento_quirurgico: asStr(r.tratamiento_quirurgico),
        tratamiento_qt: asStr(r.tratamiento_qt),
        tratamiento_rt: asStr(r.tratamiento_rt),
        tratamiento_dirigido: asStr(r.tratamiento_dirigido),
        respuesta_previa: asStr(r.respuesta_previa),

        // Propuesta y narrativa
        motivo: asStr(r.motivo_presentacion),
        linea_propuesta: asInt(r.linea_propuesta),
        molecula_propuesta: asStr(r.molecula_propuesta),
        tratamiento_propuesto: asStr(r.tratamiento_propuesto),
        pregunta_comite: asStr(r.pregunta_comite),
        justificacion_clinica: asStr(r.justificacion_clinica),

        // Evidencia
        evidencia_referencia: asStr(r.evidencia_referencia),
        evidencia_tipo: asStr(r.evidencia_tipo),
        evidencia_link: asStr(r.evidencia_link),
        pfs_esperado_estudio: asNum(r.pfs_esperado_estudio),
        os_esperado_estudio: asNum(r.os_esperado_estudio),

        // Regulatorio
        tiene_invima: asBool(r.tiene_invima) ?? false,
        en_unirse: asBool(r.en_unirse) ?? false,
        presentacion_obligatoria: asBool(r.presentacion_obligatoria) ?? false,

        // Economía
        costo_estimado: asNum(r.costo_estimado),
        costo_post: asNum(r.costo_post) ?? 0,
        costo_molecula_aprobada: asNum(r.costo_molecula_aprobada) ?? 0,

        // Decisión
        decision: asStr(r.decision) || 'pendiente',
        molecula_aprobada: asStr(r.molecula_aprobada),
        justificacion_decision: asStr(r.justificacion_decision),
        adherente_protocolo: asBool(r.adherente_protocolo),
        motivo_no_adherencia: asStr(r.motivo_no_adherencia),
        valoracion_psicosocial: asBool(r.valoracion_psicosocial) ?? false,

        // Cierre
        estado: asStr(r.estado_caso) || 'activo',
        motivo_cancelacion: asStr(r.motivo_cancelacion),
      }

      // Limpiar nulls explícitos (Supabase los acepta, pero menos ruido)
      const { error: cErr } = await supabase.from('casos_comite').insert(casoPayload)
      if (cErr) throw new Error(`caso: ${cErr.message}`)

      okCount++
    } catch (e) {
      errCount++
      const msg = `Fila ${filaNum} (doc=${r.documento || '?'}): ${e.message}`
      errores.push(msg)
      err(msg)
    }
  }

  console.log('')
  log(`CASOS_COMITE: ${okCount} insertados, ${errCount} errores`)
  if (errores.length > 0 && errores.length <= 10) {
    console.log('\nResumen de errores:')
    errores.forEach(e => console.log(`  • ${e}`))
  } else if (errores.length > 10) {
    console.log(`\n(${errores.length} errores, mostrando primeros 10)`)
    errores.slice(0, 10).forEach(e => console.log(`  • ${e}`))
  }
}

// ── Importador: DESENLACES ───────────────────────────────────

async function importDesenlaces(wb, lookups) {
  const { protocolos } = lookups
  const filas = readSheet(wb, 'DESENLACES', { skipExampleRow: true })

  if (!filas.length) {
    info('DESENLACES: sin filas para importar')
    return
  }

  info(`DESENLACES: ${filas.length} filas detectadas, procesando...`)

  let okCount = 0
  let errCount = 0

  for (const [idx, r] of filas.entries()) {
    const filaNum = idx + 4
    try {
      const docKey = String(r.documento || '').trim()
      if (!docKey) {
        warn(`Fila ${filaNum}: sin documento, omitida`)
        continue
      }
      const tipoDoc = asStr(r.tipo_documento) || 'CC'

      // Buscar paciente
      const { data: pac } = await supabase
        .from('pacientes')
        .select('id')
        .eq('documento', docKey)
        .eq('tipo_documento', tipoDoc)
        .maybeSingle()

      if (!pac) {
        throw new Error(`paciente doc=${docKey} no encontrado`)
      }

      // Buscar caso más reciente del paciente
      const { data: caso } = await supabase
        .from('casos_comite')
        .select('id')
        .eq('paciente_id', pac.id)
        .order('fecha_solicitud', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error: dErr } = await supabase.from('desenlaces').insert({
        paciente_id: pac.id,
        caso_id: caso?.id || null,
        protocolo_id: lookupId(protocolos, r.protocolo_asociado, 'protocolo', []),
        mejor_respuesta: asStr(r.mejor_respuesta),
        fecha_mejor_respuesta: asDate(r.fecha_mejor_respuesta),
        fecha_inicio_tx: asDate(r.fecha_inicio_tx),
        fecha_progresion: asDate(r.fecha_progresion),
        pfs_meses: asNum(r.pfs_meses),
        evento_pfs: asBool(r.evento_pfs) ?? false,
        fecha_muerte: asDate(r.fecha_muerte),
        os_meses: asNum(r.os_meses),
        evento_os: asBool(r.evento_os) ?? false,
        causa_muerte: asStr(r.causa_muerte),
        toxicidad_max: asInt(r.toxicidad_max),
        toxicidad_descripcion: asStr(r.toxicidad_descripcion),
        suspension_toxicidad: asBool(r.suspension_toxicidad) ?? false,
        pfs_esperado: asNum(r.pfs_esperado),
        os_esperado: asNum(r.os_esperado),
        avac_estimado: asNum(r.avac_estimado),
        costo_total: asNum(r.costo_total),
        costo_avac: asNum(r.costo_avac),
        estado_vital: asStr(r.estado_vital) || 'vivo',
        fecha_ultimo_contacto: asDate(r.fecha_ultimo_contacto),
      })
      if (dErr) throw new Error(dErr.message)
      okCount++
    } catch (e) {
      errCount++
      err(`Desenlace fila ${filaNum}: ${e.message}`)
    }
  }

  console.log('')
  log(`DESENLACES: ${okCount} insertados, ${errCount} errores`)
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    err('Uso: node scripts/import_excel.js ruta/al/archivo.xlsx')
    process.exit(1)
  }

  console.log('\n📂 Leyendo archivo:', filePath)
  const wb = XLSX.read(readFileSync(resolve(filePath)), {
    type: 'buffer',
    cellDates: false,
  })
  console.log('   Hojas:', wb.SheetNames.join(', '))
  console.log('\n🚀 Iniciando importación...\n')

  try {
    // ─── 1. Catálogos ──────────────────────────────────
    await importCatalog(wb, 'SEDES', 'sedes',
      r => ({
        nombre: asStr(r.nombre),
        ciudad: asStr(r.ciudad) || 'Cali',
        activa: asBool(r.activa) ?? true,
      })
    )

    await importCatalog(wb, 'EPS', 'eps',
      r => ({
        nombre: asStr(r.nombre),
        codigo: asStr(r.codigo),
        activa: asBool(r.activa) ?? true,
      })
    )

    // Lookups parciales para médicos
    const sedesPartial = await buildLookup('sedes', 'nombre')

    await importCatalog(wb, 'MEDICOS', 'medicos',
      r => ({
        nombre: asStr(r.nombre),
        especialidad: asStr(r.especialidad),
        registro_medico: asStr(r.registro_medico),
        sede_id: lookupId(sedesPartial, r.sede, 'sede', []),
        activo: asBool(r.activo) ?? true,
      })
    )

    await importCatalog(wb, 'GESTORES', 'gestores',
      r => ({
        nombre: asStr(r.nombre),
        email: asStr(r.email),
        rol: asStr(r.rol) || 'gestor_seguimiento',
        activo: asBool(r.activo) ?? true,
      })
    )

    await importCatalog(wb, 'PROTOCOLOS', 'protocolos',
      r => ({
        nombre: asStr(r.nombre),
        cie10: asStr(r.cie10),
        diagnostico: asStr(r.diagnostico),
        linea_tratamiento: asInt(r.linea_tratamiento),
        regimen_estandar: asStr(r.regimen_estandar),
        pfs_esperado_meses: asNum(r.pfs_esperado_meses),
        os_esperado_meses: asNum(r.os_esperado_meses),
        estudio_pivotal: asStr(r.estudio_pivotal),
        referencia: asStr(r.referencia),
        requiere_comite: asBool(r.requiere_comite) ?? true,
        activo: asBool(r.activo) ?? true,
      })
    )

    // ─── 2. Lookups completos ──────────────────────────
    info('Construyendo lookups...')
    const lookups = {
      sedes:      await buildLookup('sedes', 'nombre'),
      eps:        await buildLookup('eps', 'nombre'),
      medicos:    await buildLookup('medicos', 'nombre'),
      gestores:   await buildLookup('gestores', 'nombre'),
      protocolos: await buildLookup('protocolos', 'nombre'),
    }
    log(`Lookups: sedes=${Object.keys(lookups.sedes).length}, eps=${Object.keys(lookups.eps).length}, medicos=${Object.keys(lookups.medicos).length}, gestores=${Object.keys(lookups.gestores).length}, protocolos=${Object.keys(lookups.protocolos).length}`)

    // ─── 3. Casos ──────────────────────────────────────
    console.log('')
    await importCasos(wb, lookups)

    // ─── 4. Desenlaces ────────────────────────────────
    console.log('')
    await importDesenlaces(wb, lookups)

    console.log('\n✅ Importación completada\n')
  } catch (e) {
    err(`Error fatal: ${e.message}`)
    process.exit(1)
  }
}

main()
