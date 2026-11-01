import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { INSTITUCION } from '../lib/institucion'
import { formatDate, formatDateTime } from '../lib/utils'
import ElCircuito from './ElCircuito'

const GENERO_LABEL = { M: 'Masculino', F: 'Femenino', I: 'Indeterminado' }
const ECOG_LABEL = {
  '0': '0 — Asintomático', '1': '1 — Síntomas leves', '2': '2 — Encamado <50%',
  '3': '3 — Encamado >50%', '4': '4 — Postrado',
}
const DECISION_LABEL = {
  aprobado: 'Aprobado', rechazado: 'Rechazado', modificado: 'Aprobado con modificaciones',
  diferido: 'Diferido', pendiente_info: 'Pendiente de información',
}
const INTENCION_LABEL = {
  curativa: 'Curativa', paliativa: 'Paliativa', neoadyuvante: 'Neoadyuvante', adyuvante: 'Adyuvante',
}

function edadDe(fnac) {
  if (!fnac) return null
  const d = new Date(fnac)
  if (isNaN(d)) return null
  const hoy = new Date()
  let e = hoy.getFullYear() - d.getFullYear()
  const m = hoy.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--
  return e
}

// Divide el resumen de biomarcadores en filas para la tabla.
function filasBiomarcadores(texto) {
  if (!texto) return []
  return texto.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(linea => {
    const i = linea.search(/[:=]/)
    if (i > 0) return { marcador: linea.slice(0, i).trim(), resultado: linea.slice(i + 1).trim() }
    return { marcador: linea, resultado: '' }
  })
}

export default function ActaDocumento({ caso, form, acta }) {
  const p = caso?.paciente || {}
  const edad = edadDe(p.fecha_nacimiento)
  const sesionFecha = caso?.sesion?.fecha || caso?.fecha_solicitud
  const tipoComite = caso?.sesion?.tipo_comite || caso?.tipo_comite
  const asegurador = caso?.paciente?.eps?.nombre
  const asistentes = form?.participantes || []
  const bios = filasBiomarcadores(caso?.biomarcadores)
  const hashCorto = acta?.hash_contenido ? acta.hash_contenido.slice(0, 7) : null

  return (
    <div className="print-doc bg-white text-slate-900 max-w-[820px] mx-auto rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* ── Encabezado institucional ── */}
      <div className="flex items-center gap-3 px-8 py-4 border-b-2 border-slate-800">
        <ElCircuito size={34} />
        <div className="flex-1">
          <div className="font-display font-bold text-[15px] leading-tight text-slate-900">{INSTITUCION.nombre}</div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">{INSTITUCION.subtitulo}</div>
        </div>
        <div className="text-right text-[10px] font-mono text-slate-500 leading-relaxed">
          <div>CÓDIGO <b className="text-slate-800">{INSTITUCION.codigo_formato}</b> · VERSIÓN <b className="text-slate-800">{INSTITUCION.version_formato}</b></div>
          <div>VIGENCIA <b className="text-slate-800">{INSTITUCION.vigencia}</b></div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* ── Título ── */}
        <div>
          <h1 className="font-display font-bold text-2xl tracking-tight text-slate-900">
            Acta de comité oncológico multidisciplinario
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-mono text-slate-500">
            <span className="px-2 py-0.5 rounded bg-bronce/15 text-bronce font-bold uppercase tracking-wide"
              style={{ color: '#B9832F', background: 'rgba(185,131,47,0.12)' }}>
              CASO {p.tipo_documento || 'CC'} {caso?.id ?? ''}
            </span>
            <span>ACTA N.º {acta?.id ?? '—'}</span>
            <span>·</span>
            <span>{formatDate(sesionFecha) || '—'}</span>
          </div>
        </div>

        {/* ── 01 Datos de la sesión ── */}
        <Seccion n="01" titulo="Datos de la sesión">
          <Campos cols={4} items={[
            ['Fecha', formatDate(sesionFecha)],
            ['Tipo de comité', tipoComite],
            ['Asistentes', asistentes.length ? `${asistentes.length} miembros` : null],
            ['Estado', acta?.firmada ? 'Firmada' : 'Borrador'],
          ]} />
        </Seccion>

        {/* ── 02 Identificación del paciente ── */}
        <Seccion n="02" titulo="Identificación del paciente">
          <Campos cols={3} items={[
            ['Nombre completo', p.nombre],
            ['Documento', p.documento ? `${p.tipo_documento || ''} ${p.documento}`.trim() : null],
            ['Edad', edad != null ? `${edad} años` : null],
            ['Sexo', GENERO_LABEL[p.genero] || p.genero],
            ['Asegurador', asegurador],
          ]} />
        </Seccion>

        {/* ── 03 Resumen clínico ── */}
        <Seccion n="03" titulo="Resumen clínico">
          {form?.resumen_clinico
            ? <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line">{form.resumen_clinico}</p>
            : <Vacio />}
          <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-4">
            <Campos cols={3} small items={[
              ['Diagnóstico', caso?.diagnostico_descripcion || caso?.cie10],
              ['Histología', caso?.histologia],
              ['Fecha de diagnóstico', formatDate(caso?.fecha_diagnostico)],
              ['ECOG', ECOG_LABEL[caso?.ecog] || caso?.ecog],
              ['Dolor (EVA)', caso?.eva != null ? `${caso.eva} / 10` : null],
              ['Comorbilidades', caso?.comorbilidades],
            ]} />
          </div>
        </Seccion>

        {/* ── 04 Estadificación ── */}
        <Seccion n="04" titulo="Estadificación">
          <Campos cols={3} items={[
            ['TNM', caso?.tnm],
            ['Estadio', caso?.estadio_clinico ? (caso.estadio_clinico.startsWith('Sin') ? caso.estadio_clinico : `Estadio ${caso.estadio_clinico}`) : null],
            ['Inmunohistoquímica', caso?.inmunohistoquimica],
            ...(caso?.estadio_observaciones ? [['Observaciones', caso.estadio_observaciones]] : []),
          ]} />
        </Seccion>

        {/* ── 05 Biomarcadores y estudios moleculares ── */}
        <Seccion n="05" titulo="Biomarcadores y estudios moleculares">
          {bios.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 font-medium">Marcador</th>
                  <th className="py-1.5 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {bios.map((b, i) => (
                  <tr key={i} className="border-t border-slate-200">
                    <td className="py-2 pr-4 text-slate-700">{b.marcador}</td>
                    <td className="py-2 font-medium text-slate-900">{b.resultado || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Vacio />}
          {caso?.estudios_moleculares && (
            <div className="mt-3 text-sm">
              <span className="text-[10px] font-mono uppercase tracking-wide text-slate-400">Molecular / NGS</span>
              <p className="text-slate-800 whitespace-pre-line">{caso.estudios_moleculares}</p>
            </div>
          )}
        </Seccion>

        {/* ── 06 Discusión ── */}
        <Seccion n="06" titulo="Discusión">
          {form?.discusion
            ? <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line">{form.discusion}</p>
            : <Vacio />}
        </Seccion>

        {/* ── 07 Conclusión y plan de manejo ── */}
        <Seccion n="07" titulo="Conclusión y plan de manejo">
          <div className="rounded-lg border border-slate-300 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {form?.decision_final && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  {DECISION_LABEL[form.decision_final] || form.decision_final}
                </span>
              )}
              {form?.intencion && (
                <span className="text-[11px] font-mono uppercase tracking-wide text-slate-500">
                  Intención: {INTENCION_LABEL[form.intencion] || form.intencion}
                </span>
              )}
            </div>
            {form?.decision
              ? <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line">{form.decision}</p>
              : <Vacio />}
          </div>
        </Seccion>

        {/* ── 09 Asistencia y firmas ── */}
        <Seccion n="09" titulo="Asistencia y firmas">
          {asistentes.length === 0 ? <Vacio texto="Sin asistentes registrados." /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 font-medium">Miembro</th>
                  <th className="py-1.5 font-medium">Especialidad</th>
                  <th className="py-1.5 font-medium">Registro</th>
                  <th className="py-1.5 font-medium">Firma</th>
                </tr>
              </thead>
              <tbody>
                {asistentes.map((a, i) => (
                  <tr key={i} className="border-t border-slate-200 print-avoid-break align-top">
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{a.nombre}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{a.especialidad || '—'}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">{a.registro || '—'}</td>
                    <td className="py-2.5">
                      <FirmaImg path={a.firma_path} />
                      {a.fecha_firma && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Firmado {formatDateTime(a.fecha_firma)}{hashCorto ? ` · ${hashCorto}` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {acta?.cerrada_por && (
            <p className="text-[11px] text-slate-500 mt-3">
              Acta cerrada por <b>{acta.cerrada_por}</b>. Las firmas se verifican contra el registro de
              autenticación de SGICO{hashCorto ? `; el código ${hashCorto} corresponde al hash del contenido del acta` : ''}.
            </p>
          )}
        </Seccion>

        {/* ── 10 Observaciones ── */}
        {form?.observaciones && (
          <Seccion n="10" titulo="Observaciones">
            <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line">{form.observaciones}</p>
          </Seccion>
        )}
      </div>

      {/* ── Pie legal ── */}
      <div className="px-8 py-3 border-t border-slate-200 flex items-baseline justify-between gap-4 text-[10px] font-mono text-slate-400">
        <span className="max-w-[70%]">{INSTITUCION.aviso_legal}</span>
        <span>ACTA {acta?.id ?? '—'} · {p.tipo_documento || 'CC'} {caso?.id ?? ''}</span>
      </div>
    </div>
  )
}

function Seccion({ n, titulo, children }) {
  return (
    <section className="print-avoid-break">
      <div className="flex items-center gap-2 mb-3 pb-1.5 border-b border-slate-300">
        <span className="text-[11px] font-mono font-bold" style={{ color: '#B9832F' }}>{n}</span>
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-slate-800">{titulo}</h2>
      </div>
      {children}
    </section>
  )
}

function Campos({ items, cols = 3, small = false }) {
  const grid = cols === 4 ? 'sm:grid-cols-4' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
  return (
    <div className={`grid grid-cols-2 ${grid} gap-x-4 gap-y-3`}>
      {items.filter(([, v]) => v != null && v !== '').map(([label, value], i) => (
        <div key={i}>
          <div className="text-[10px] font-mono uppercase tracking-wide text-slate-400">{label}</div>
          <div className={`${small ? 'text-sm' : 'text-sm'} text-slate-900 mt-0.5 whitespace-pre-line`}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function Vacio({ texto = 'No registrado' }) {
  return <p className="text-sm text-slate-400 italic">{texto}</p>
}

// Firma desde una URL firmada temporal del bucket privado.
function FirmaImg({ path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let vivo = true
    if (!path) { setUrl(null); return }
    supabase.storage.from('firmas').createSignedUrl(path, 600).then(({ data }) => {
      if (vivo) setUrl(data?.signedUrl || null)
    })
    return () => { vivo = false }
  }, [path])
  if (!path) return <span className="text-[10px] font-mono text-slate-400 italic">Sin firma en archivo</span>
  return url
    ? <img src={url} alt="Firma" className="h-12 max-w-[180px] object-contain" />
    : <span className="text-[10px] font-mono text-slate-400 italic">Cargando…</span>
}
