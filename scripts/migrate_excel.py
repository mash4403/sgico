"""
SGICO — Script de migración de Excel a PostgreSQL/Supabase
==========================================================
Ejecutar: python scripts/migrate_excel.py --file "ruta/al/archivo.xlsx"

Requisitos: pip install pandas openpyxl supabase python-dotenv
"""

import argparse
import os
import sys
import json
from datetime import datetime
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL') or os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_SERVICE_KEY')

# Mapeo de columnas del Excel actual → campos de la BD
COLUMN_MAP = {
    'FECHA SOLICITUD COMITE ONCOLOGICO': 'fecha_solicitud',
    'NOMBRE DEL MEDICO TRATANTE O SOLICITANTE': 'medico_nombre',
    'SEDE': 'sede_nombre',
    'TIPO DE COMITÉ': 'tipo_comite',
    'EPS': 'eps_nombre',
    'PACIENTE': 'paciente_nombre',
    'TIPO IDENTIFICACION': 'tipo_documento',
    'DOCUMENTO': 'documento',
    'GENERO': 'genero',
    'EDAD': 'edad',
    'TELEFONO 1': 'telefono1',
    'MOTIVO PRESENTACION EN COMITÉ': 'motivo',
    'MOLECULA PROPUESTA EN COMITÉ': 'molecula_propuesta',
    'MEDICAMENTO CON INVIMA': 'tiene_invima',
    'MEDICAMENTO UNIRSE': 'en_unirse',
    'VALOR DE LA MOLECULA': 'valor_molecula',
    'VALORACION POR EQUIPOS PSICO SOCIAL': 'valoracion_psicosocial',
    'FECHA PRESENTACION EN COMITÉ ONCOLOGICO': 'fecha_presentacion',
    'DECISIÓN COMITÉ ONCOLOGICO': 'decision_texto',
    'MOLECULA ACEPTADA EN COMITÉ ONCOLOGICO': 'molecula_aprobada',
    'Descripción de los medicamentos antes del Comite': 'tratamiento_previo',
    'Valor Quimioterapia antes del comite': 'costo_previo',
    'VALOR MOLECULA ACEPTADA EN COMITÉ ONCOLOGICO': 'costo_molecula_aprobada',
    'Valor Quimioterapia Despues del la aceptación del comite': 'costo_post',
    'ESTADO DEL CASO': 'estado_texto',
    'MOTIVO DE CANCELACION': 'motivo_cancelacion',
    'FALLECIDOS': 'fallecido',
}


def clean_value(val):
    """Limpia valores nulos y strings vacíos."""
    if pd.isna(val) or val == '' or val == 'nan':
        return None
    if isinstance(val, str):
        return val.strip()
    return val


def parse_date(val):
    """Intenta parsear una fecha en múltiples formatos."""
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y']:
        try:
            return datetime.strptime(str(val).strip(), fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def parse_money(val):
    """Convierte valores monetarios a float."""
    if pd.isna(val) or val is None:
        return 0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace('$', '').replace('.', '').replace(',', '.').strip()
    try:
        return float(s)
    except ValueError:
        return 0


def parse_decision(val):
    """Mapea decisiones del Excel a valores válidos."""
    if not val:
        return 'pendiente'
    v = str(val).lower().strip()
    mapping = {
        'aprobado': 'aprobado', 'aprobada': 'aprobado', 'si': 'aprobado',
        'rechazado': 'rechazado', 'rechazada': 'rechazado', 'no': 'rechazado',
        'modificado': 'modificado', 'modificada': 'modificado',
        'diferido': 'diferido', 'diferida': 'diferido',
        'pendiente': 'pendiente',
    }
    for key, val_mapped in mapping.items():
        if key in v:
            return val_mapped
    return 'pendiente'


def parse_estado(val, fallecido=None):
    """Mapea estado del caso."""
    if fallecido and str(fallecido).lower() in ['si', 'sí', 'x', '1', 'true', 'fallecido']:
        return 'fallecido'
    if not val:
        return 'activo'
    v = str(val).lower().strip()
    mapping = {
        'activo': 'activo', 'abierto': 'activo',
        'tratamiento': 'en_tratamiento', 'en tratamiento': 'en_tratamiento',
        'cancelado': 'cancelado', 'cerrado': 'cancelado',
        'fallecido': 'fallecido', 'muerto': 'fallecido',
        'completado': 'completado', 'terminado': 'completado',
    }
    for key, val_mapped in mapping.items():
        if key in v:
            return val_mapped
    return 'activo'


def parse_genero(val):
    if not val:
        return None
    v = str(val).upper().strip()[0]
    return v if v in ('M', 'F', 'O') else None


def parse_bool(val):
    if pd.isna(val) or val is None:
        return False
    v = str(val).lower().strip()
    return v in ('si', 'sí', 'x', '1', 'true', 'yes')


def get_or_create(sb, table, match_field, match_value, defaults=None):
    """Busca o crea un registro en una tabla catálogo."""
    if not match_value:
        return None
    result = sb.table(table).select('id').eq(match_field, match_value).limit(1).execute()
    if result.data:
        return result.data[0]['id']
    insert_data = {match_field: match_value}
    if defaults:
        insert_data.update(defaults)
    result = sb.table(table).insert(insert_data).execute()
    return result.data[0]['id'] if result.data else None


def migrate(file_path, dry_run=False):
    """Ejecuta la migración del Excel."""
    print(f"\n{'='*60}")
    print(f"SGICO — Migración de Excel")
    print(f"{'='*60}")
    print(f"Archivo: {file_path}")
    print(f"Modo: {'SIMULACIÓN (dry run)' if dry_run else 'PRODUCCIÓN'}")
    print(f"{'='*60}\n")

    # Leer Excel
    df = pd.read_excel(file_path)
    print(f"✓ {len(df)} filas leídas del Excel")
    print(f"  Columnas encontradas: {len(df.columns)}")

    # Renombrar columnas
    rename_map = {}
    for col in df.columns:
        col_clean = col.strip()
        if col_clean in COLUMN_MAP:
            rename_map[col] = COLUMN_MAP[col_clean]
    df = df.rename(columns=rename_map)
    mapped_cols = [c for c in rename_map.values()]
    print(f"  Columnas mapeadas: {len(mapped_cols)}")
    unmapped = [c for c in df.columns if c not in mapped_cols and c not in rename_map]
    if unmapped:
        print(f"  ⚠ Columnas no mapeadas: {unmapped[:5]}...")

    if dry_run:
        print("\n📊 Vista previa de datos:")
        for i, row in df.head(3).iterrows():
            print(f"\n  Fila {i+1}:")
            print(f"    Paciente: {row.get('paciente_nombre', '?')}")
            print(f"    Documento: {row.get('documento', '?')}")
            print(f"    Fecha solicitud: {row.get('fecha_solicitud', '?')}")
            print(f"    Molécula propuesta: {row.get('molecula_propuesta', '?')}")
            print(f"    Decisión: {row.get('decision_texto', '?')}")
        print(f"\n✓ Simulación completa. {len(df)} registros listos para migrar.")
        print(f"  Ejecutar sin --dry-run para migrar.")
        return

    # Conectar a Supabase
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("✗ Error: Variables SUPABASE_URL y SUPABASE_KEY requeridas en .env")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✓ Conectado a Supabase")

    # Cache de catálogos
    cache_eps = {}
    cache_sedes = {}
    cache_medicos = {}

    migrados = 0
    errores = 0

    for i, row in df.iterrows():
        try:
            # 1. EPS
            eps_nombre = clean_value(row.get('eps_nombre'))
            if eps_nombre and eps_nombre not in cache_eps:
                cache_eps[eps_nombre] = get_or_create(sb, 'eps', 'nombre', eps_nombre)
            eps_id = cache_eps.get(eps_nombre)

            # 2. Sede
            sede_nombre = clean_value(row.get('sede_nombre'))
            if sede_nombre and sede_nombre not in cache_sedes:
                cache_sedes[sede_nombre] = get_or_create(sb, 'sedes', 'nombre', sede_nombre)
            sede_id = cache_sedes.get(sede_nombre)

            # 3. Médico
            medico_nombre = clean_value(row.get('medico_nombre'))
            if medico_nombre and medico_nombre not in cache_medicos:
                cache_medicos[medico_nombre] = get_or_create(sb, 'medicos', 'nombre', medico_nombre)
            medico_id = cache_medicos.get(medico_nombre)

            # 4. Paciente
            documento = str(row.get('documento', '')).strip().replace('.0', '')
            if not documento or documento == 'nan':
                print(f"  ⚠ Fila {i+1}: Sin documento, saltando")
                continue

            tipo_doc = clean_value(row.get('tipo_documento')) or 'CC'
            tipo_doc = tipo_doc.upper().strip()[:5]
            if tipo_doc not in ('CC', 'TI', 'CE', 'PA', 'RC', 'NIT'):
                tipo_doc = 'CC'

            # Buscar paciente existente
            pac_result = sb.table('pacientes').select('id').eq('documento', documento).limit(1).execute()
            if pac_result.data:
                paciente_id = pac_result.data[0]['id']
            else:
                pac_data = {
                    'tipo_documento': tipo_doc,
                    'documento': documento,
                    'nombre': clean_value(row.get('paciente_nombre')) or 'Sin nombre',
                    'genero': parse_genero(row.get('genero')),
                    'telefono1': clean_value(row.get('telefono1')),
                    'eps_id': eps_id,
                    'sede_id': sede_id,
                }
                pac_result = sb.table('pacientes').insert(pac_data).execute()
                paciente_id = pac_result.data[0]['id']

            # 5. Diagnóstico básico
            dx_result = sb.table('diagnosticos').insert({
                'paciente_id': paciente_id,
                'cie10': 'C00',  # Genérico, se actualiza manualmente
                'descripcion': clean_value(row.get('motivo')) or 'Pendiente clasificación',
                'fecha_diagnostico': parse_date(row.get('fecha_solicitud')),
            }).execute()
            diagnostico_id = dx_result.data[0]['id'] if dx_result.data else None

            # 6. Caso comité
            decision = parse_decision(row.get('decision_texto'))
            estado = parse_estado(row.get('estado_texto'), row.get('fallecido'))

            caso_data = {
                'paciente_id': paciente_id,
                'diagnostico_id': diagnostico_id,
                'medico_id': medico_id,
                'sede_id': sede_id,
                'fecha_solicitud': parse_date(row.get('fecha_solicitud')) or datetime.now().strftime('%Y-%m-%d'),
                'tipo_comite': 'tumor_solido',
                'motivo': clean_value(row.get('motivo')) or 'Migrado desde Excel',
                'molecula_propuesta': clean_value(row.get('molecula_propuesta')),
                'tiene_invima': parse_bool(row.get('tiene_invima')),
                'en_unirse': parse_bool(row.get('en_unirse')),
                'fecha_presentacion': parse_date(row.get('fecha_presentacion')),
                'decision': decision,
                'molecula_aprobada': clean_value(row.get('molecula_aprobada')),
                'tratamiento_previo': clean_value(row.get('tratamiento_previo')),
                'costo_previo': parse_money(row.get('costo_previo')),
                'costo_molecula_aprobada': parse_money(row.get('costo_molecula_aprobada')),
                'costo_post': parse_money(row.get('costo_post')),
                'valoracion_psicosocial': parse_bool(row.get('valoracion_psicosocial')),
                'estado': estado,
                'motivo_cancelacion': clean_value(row.get('motivo_cancelacion')),
            }
            sb.table('casos_comite').insert(caso_data).execute()

            migrados += 1
            if migrados % 50 == 0:
                print(f"  ... {migrados} registros migrados")

        except Exception as e:
            errores += 1
            print(f"  ✗ Error fila {i+1}: {str(e)[:100]}")

    print(f"\n{'='*60}")
    print(f"RESULTADO")
    print(f"{'='*60}")
    print(f"  ✓ Migrados: {migrados}")
    print(f"  ✗ Errores:  {errores}")
    print(f"  Total:     {len(df)}")
    print(f"\n  EPS creadas: {len(cache_eps)}")
    print(f"  Sedes creadas: {len(cache_sedes)}")
    print(f"  Médicos creados: {len(cache_medicos)}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Migrar Excel del comité oncológico a SGICO')
    parser.add_argument('--file', '-f', required=True, help='Ruta al archivo Excel (.xlsx)')
    parser.add_argument('--dry-run', '-d', action='store_true', help='Solo simular, no escribir en BD')
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"✗ Archivo no encontrado: {args.file}")
        sys.exit(1)

    migrate(args.file, dry_run=args.dry_run)
