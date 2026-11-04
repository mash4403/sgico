"""
Convierte la plantilla del catálogo de protocolos (plantilla_catalogo_protocolos.xlsx)
en un script SQL para el SQL Editor de Supabase.

Uso:  python importar_catalogo.py [--reemplazar] catalogo_lleno.xlsx > carga_catalogo.sql
Requiere: openpyxl  (y la migración 020 aplicada)

- Lee la hoja "Catálogo" desde la fila 3 (fila 1 = encabezados, fila 2 = ayuda).
- Por defecto: si ya existe un protocolo con el mismo nombre lo actualiza;
  si no, lo crea.
- --reemplazar: el archivo pasa a ser el catálogo completo. Los protocolos
  anteriores que algún caso o desenlace usa se desactivan (activo = false,
  conservan la historia); los demás se borran. Luego se insertan todas las
  filas, aunque se repita un nombre en diagnósticos distintos.
- Todo en una sola transacción.
- Valida obligatorios y tipos; si hay errores no genera SQL y los lista.
"""
import sys
from datetime import date, datetime

from openpyxl import load_workbook

TIPOS = {
    'ensayo fase iii': 'fase_3', 'ensayo fase ii': 'fase_2', 'ensayo fase i': 'fase_1',
    'metaanálisis': 'metanalisis', 'revisión sistemática': 'revision_sistematica',
    'guía de práctica clínica': 'guia', 'consenso de expertos': 'consenso',
    'evidencia del mundo real (rwe)': 'real_world', 'reporte de caso': 'reporte_caso', 'otro': 'otro',
}

# Columna (1-based) → campo
NOMBRE, CIE10, DIAG, LINEA, ESQUEMA, MOLECULAS, ESTUDIO, TIPO, REF, LINK, PFS, OS, ORR, REQ, VIGENCIA = range(1, 16)


REEMPLAZO = """
-- Catálogo anterior: desactivar los que usa algún caso o desenlace, borrar el resto
DO $$
DECLARE v_total int;
BEGIN
  SELECT COUNT(*) INTO v_total FROM protocolos;
  RAISE NOTICE 'Protocolos antes de la carga: %', v_total;
END $$;
UPDATE protocolos SET activo = false
 WHERE id IN (SELECT protocolo_id FROM casos_comite WHERE protocolo_id IS NOT NULL
              UNION SELECT protocolo_id FROM desenlaces WHERE protocolo_id IS NOT NULL);
DELETE FROM protocolos p
 WHERE NOT EXISTS (SELECT 1 FROM casos_comite c WHERE c.protocolo_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM desenlaces d WHERE d.protocolo_id = p.id);
"""


def txt(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def sql(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def num(v, fila, campo, errores):
    if v is None or str(v).strip() == '':
        return None
    try:
        return float(str(v).replace(',', '.'))
    except ValueError:
        errores.append(f'Fila {fila}: {campo} no es un número ({v!r})')
        return None


def main(path, reemplazar=False):
    ws = load_workbook(path, data_only=True)['Catálogo']
    errores, filas = [], []
    for r in range(3, ws.max_row + 1):
        val = lambda c: ws.cell(row=r, column=c).value
        if all(txt(val(c)) is None for c in range(1, 16)):
            continue
        nombre, estudio, tipo_txt = txt(val(NOMBRE)), txt(val(ESTUDIO)), txt(val(TIPO))
        if not nombre:
            errores.append(f'Fila {r}: falta el nombre del protocolo')
        if not estudio:
            errores.append(f'Fila {r}: falta el estudio que lo soporta')
        tipo = TIPOS.get((tipo_txt or '').lower())
        if not tipo:
            errores.append(f'Fila {r}: tipo de estudio no válido ({tipo_txt!r})')

        linea = num(val(LINEA), r, 'línea de tratamiento', errores)
        vig = val(VIGENCIA)
        if isinstance(vig, (datetime, date)):
            vig = vig.strftime('%Y-%m-%d')
        else:
            vig = txt(vig)
        req = (txt(val(REQ)) or 'sí').lower() not in ('no', 'n', 'false')
        moleculas = [m.strip() for m in (txt(val(MOLECULAS)) or '').split(';') if m.strip()]

        filas.append({
            'nombre': nombre, 'cie10': txt(val(CIE10)), 'diagnostico': txt(val(DIAG)),
            'linea_tratamiento': int(linea) if linea is not None else None,
            'regimen_estandar': txt(val(ESQUEMA)),
            'moleculas_protocolo': '[' + ', '.join('"' + m.replace('"', '\\"') + '"' for m in moleculas) + ']',
            'estudio_pivotal': estudio, 'tipo_evidencia': tipo, 'referencia': txt(val(REF)),
            'evidencia_link': txt(val(LINK)),
            'pfs_esperado_meses': num(val(PFS), r, 'PFS', errores),
            'os_esperado_meses': num(val(OS), r, 'OS', errores),
            'orr_esperada': num(val(ORR), r, 'ORR', errores),
            'requiere_comite': req, 'fecha_vigencia': vig,
        })

    if errores:
        sys.stderr.write('No se generó el SQL. Corrige estas filas:\n  ' + '\n  '.join(errores) + '\n')
        sys.exit(1)

    print('-- Carga del catálogo de protocolos generada desde', path)
    print('BEGIN;')
    if reemplazar:
        print(REEMPLAZO)
    for f in filas:
        cols = list(f.keys())
        vals = [sql(f[c]) + ('::jsonb' if c == 'moleculas_protocolo' else '') + ('::date' if c == 'fecha_vigencia' and f[c] else '') for c in cols]
        if reemplazar:
            print(f"INSERT INTO protocolos ({', '.join(cols)}, activo) VALUES ({', '.join(vals)}, true);")
            continue
        sets = ', '.join(f'{c} = {v}' for c, v in zip(cols, vals) if c != 'nombre')
        print(f"UPDATE protocolos SET {sets}, activo = true WHERE nombre = {sql(f['nombre'])};")
        print(f"INSERT INTO protocolos ({', '.join(cols)}, activo) SELECT {', '.join(vals)}, true "
              f"WHERE NOT EXISTS (SELECT 1 FROM protocolos WHERE nombre = {sql(f['nombre'])});")
    if reemplazar:
        print(f"""DO $$
DECLARE v_act int; v_inact int;
BEGIN
  SELECT COUNT(*) FILTER (WHERE activo), COUNT(*) FILTER (WHERE NOT activo) INTO v_act, v_inact FROM protocolos;
  IF v_act <> {len(filas)} THEN
    RAISE EXCEPTION 'ABORT: quedaron % protocolos activos, se esperaban {len(filas)}', v_act;
  END IF;
  RAISE NOTICE 'Catálogo reemplazado: % protocolos activos; % anteriores desactivados por tener casos', v_act, v_inact;
END $$;""")
    else:
        print(f"DO $$ BEGIN RAISE NOTICE 'Catálogo cargado: {len(filas)} protocolos'; END $$;")
    print('COMMIT;')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--reemplazar']
    if len(args) != 1:
        sys.exit('Uso: python importar_catalogo.py [--reemplazar] catalogo_lleno.xlsx > carga_catalogo.sql')
    main(args[0], reemplazar='--reemplazar' in sys.argv)
