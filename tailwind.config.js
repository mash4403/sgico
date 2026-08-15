/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // NODOVIA — tokens de marca (valores exactos del manual v1.0)
        tinta:            '#0C1A21',
        'tinta-2':        '#10242C',
        petroleo:         '#0E4C57',
        'petroleo-claro': '#156573',
        pulso:            '#35C9B6',
        'pulso-oscuro':   '#0E9E8C',
        bronce:           '#B9832F',
        'bronce-claro':   '#D9A44E',
        hueso:            '#F3EFE7',
        niebla:           '#A9BEC2',
        'niebla-oscura':  '#6E8A90',
        // peligro/error: excepción semántica universal (alarma), fuera de paleta
        // de marca por diseño. Uso EXCLUSIVO para riesgo/error real, nunca decorativo.
        peligro:          '#D9534F',
        // legacy (apuntado a tokens de marca; se retira al cerrar el rebrand)
        sgico: {
          bg: '#0C1A21',
          card: '#10242C',
          border: '#1f2937',
          accent: '#0E4C57',
        },

        // --- Remapeo de escalas Tailwind a rampas NODOVIA ---
        // Reconvierte todo el uso existente de blue/emerald/etc. a colores de
        // marca sin tocar los componentes. El rojo (red) NO se toca: es el
        // peligro semántico. slate se conserva como neutro claro/documento.
        blue: {   // → petróleo (primario)
          50: '#EAF1F2', 100: '#CFE0E3', 200: '#A6C6CB', 300: '#73A5AD', 400: '#3E828C',
          500: '#156573', 600: '#0E4C57', 700: '#0C3E47', 800: '#0A2F36', 900: '#081F24',
        },
        indigo: { // → petróleo (para gradientes junto a blue)
          50: '#EAF1F2', 100: '#CFE0E3', 200: '#A6C6CB', 300: '#73A5AD', 400: '#3E828C',
          500: '#156573', 600: '#0E4C57', 700: '#0C3E47', 800: '#0A2F36', 900: '#081F24',
        },
        cyan: {   // → petróleo claro
          50: '#E9F2F3', 100: '#CCE2E4', 200: '#A0C8CC', 300: '#6BA9B0', 400: '#3B8791',
          500: '#156573', 600: '#12586A', 700: '#0F4A58', 800: '#0C3B46', 900: '#092C34',
        },
        emerald: { // → pulso (señal viva; en claro usar 600 = pulso-oscuro AA)
          50: '#E6F7F3', 100: '#C6EEE7', 200: '#97E0D4', 300: '#63D0BF', 400: '#47CBB8',
          500: '#35C9B6', 600: '#0E9E8C', 700: '#0B8074', 800: '#096A61', 900: '#07514B',
        },
        green: {  // → pulso (evita cualquier verde ajeno)
          50: '#E6F7F3', 100: '#C6EEE7', 200: '#97E0D4', 300: '#63D0BF', 400: '#47CBB8',
          500: '#35C9B6', 600: '#0E9E8C', 700: '#0B8074', 800: '#096A61', 900: '#07514B',
        },
      },
      fontFamily: {
        sans:    ['Manrope', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    }
  },
  plugins: [],
}
