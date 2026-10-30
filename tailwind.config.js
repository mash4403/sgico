/** @type {import('tailwindcss').Config} */

// ============================================================
// Sistema H&E — todos los colores salen de variables CSS
// (definidas en src/index.css, con modo claro/oscuro).
// Los nombres de marca previos (tinta, hueso, pulso…) y las
// escalas de Tailwind (blue, slate, emerald…) se conservan como
// alias para no tocar ningún componente: solo cambia a qué
// token apunta cada uno.
// ============================================================

const isOpaque = (o) => o === undefined || String(o).startsWith('var(') || Number(o) >= 1

// Token con soporte para el modificador de opacidad (bg-x/15).
const v = (name) => ({ opacityValue } = {}) =>
  isOpaque(opacityValue)
    ? `var(--${name})`
    : `color-mix(in srgb, var(--${name}) ${Math.round(Number(opacityValue) * 100)}%, transparent)`

// Sólido sin modificador; con modificador → otro token (los velos
// translúcidos del tema oscuro anterior pasan a su token equivalente).
const pick = (solidTok, translucentTok) => ({ opacityValue } = {}) =>
  isOpaque(opacityValue) ? `var(--${solidTok})` : `var(--${translucentTok})`

const fixed = (value) => () => value

const tint = (name, pct) => `color-mix(in srgb, var(--${name}) ${pct}%, var(--surface))`

// Escala Tailwind → rampa de un token semántico:
// 50–100 fondo suave, 200–300 borde teñido, 400+ color pleno.
const ramp = (name) => ({
  50: v(`${name}-soft`), 100: v(`${name}-soft`),
  200: fixed(tint(name, 28)), 300: fixed(tint(name, 42)),
  400: v(name), 500: v(name), 600: v(name), 700: v(name), 800: v(name), 900: v(name), 950: v(name),
})

// Para texto, toda la escala usa el color pleno (legible).
const solid = (name) => Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(k => [k, v(name)])
)

const accent = ramp('accent')
const accent2 = ramp('accent-2')
const ok = ramp('ok')
const warn = ramp('warn')
const bad = ramp('bad')
const info = ramp('info')

// Neutros (fondos y bordes)
const neutral = {
  50: v('sunken'), 100: v('sunken'), 200: v('line'), 300: v('line-strong'), 400: v('line-strong'),
  500: v('muted'), 600: v('muted'), 700: v('ink'), 800: v('ink'), 900: v('ink'), 950: v('ink'),
}

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens del sistema
        paper: v('paper'), surface: v('surface'), sunken: v('sunken'),
        ink: v('ink'), muted: v('muted'),
        line: v('line'), 'line-strong': v('line-strong'),
        accent: v('accent'), 'accent-soft': v('accent-soft'), 'on-accent': v('on-accent'),
        'accent-2': v('accent-2'), 'accent-2-soft': v('accent-2-soft'),

        // Alias de marca anterior → tokens H&E
        tinta:            v('paper'),
        'tinta-2':        v('surface'),
        petroleo:         v('accent'),
        'petroleo-claro': v('accent'),
        pulso:            v('accent'),
        'pulso-oscuro':   v('accent'),
        bronce:           v('warn'),
        'bronce-claro':   v('warn'),
        hueso:            v('ink'),
        niebla:           v('muted'),
        'niebla-oscura':  v('muted'),
        peligro:          v('bad'),
        sgico: {
          bg: v('paper'),
          card: v('surface'),
          border: v('line'),
          accent: v('accent'),
        },

        white: v('surface'),
        black: fixed('rgba(10, 8, 25, 0.45)'),

        // Escalas Tailwind → tokens semánticos
        blue: accent, indigo: accent, violet: accent,
        purple: accent2, fuchsia: accent2, pink: accent2,
        cyan: info, sky: info,
        emerald: ok, green: ok, teal: ok,
        amber: warn, yellow: warn, orange: warn,
        red: bad, rose: bad,
        slate: neutral, gray: neutral,
      },

      backgroundColor: {
        white: pick('surface', 'sunken'),   // bg-white/x: hovers y velos → hundido
        hueso: pick('sunken', 'sunken'),    // bg-hueso/5: chips y hovers → hundido
        pulso: pick('accent', 'accent-soft'),
        bronce: pick('warn', 'warn-soft'),
      },

      borderColor: {
        white: pick('surface', 'line'),
        niebla: ({ opacityValue } = {}) =>
          !isOpaque(opacityValue) && Number(opacityValue) < 0.3 ? 'var(--line)' : 'var(--line-strong)',
        slate: { 50: v('line'), 100: v('line'), 200: v('line'), 300: v('line-strong'), 400: v('line-strong') },
        gray: { 50: v('line'), 100: v('line'), 200: v('line'), 300: v('line-strong'), 400: v('line-strong') },
      },

      divideColor: {
        white: fixed('var(--line)'),
      },

      textColor: {
        white: v('on-accent'),
        tinta: v('on-accent'),
        // Gris claro del tema oscuro anterior = tinta; gris medio = atenuado
        gray: {
          50: v('ink'), 100: v('ink'), 200: v('ink'), 300: v('ink'),
          400: v('muted'), 500: v('muted'), 600: v('muted'),
          700: v('ink'), 800: v('ink'), 900: v('ink'), 950: v('ink'),
        },
        slate: {
          50: v('muted'), 100: v('muted'), 200: v('muted'), 300: v('muted'),
          400: v('muted'), 500: v('muted'), 600: v('muted'),
          700: v('ink'), 800: v('ink'), 900: v('ink'), 950: v('ink'),
        },
        blue: solid('accent'), indigo: solid('accent'), violet: solid('accent'),
        purple: solid('accent-2'), fuchsia: solid('accent-2'), pink: solid('accent-2'),
        cyan: solid('info'), sky: solid('info'),
        emerald: solid('ok'), green: solid('ok'), teal: solid('ok'),
        amber: solid('warn'), yellow: solid('warn'), orange: solid('warn'),
        red: solid('bad'), rose: solid('bad'),
      },

      fontFamily: {
        sans:    ['"Public Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['Newsreader', 'Georgia', '"Times New Roman"', 'serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },

      borderRadius: {
        DEFAULT: '5px',
        md: '6px',
        lg: '7px',
        xl: '10px',
        '2xl': '10px',
        '3xl': '12px',
      },

      // Sin sombras marcadas; solo el realce mínimo de elementos activos
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
      },
    }
  },
  plugins: [],
}
