# Informe gerencial · Fail Fast

Centro de control comercial de Fail Fast: tablero del pipeline en vivo, plan estratégico de ventas y estrategia del semestre. Sitio **100% estático** — se despliega en Vercel sin build ni backend.

## Contenido

| Archivo | Qué es |
|---|---|
| `index.html` | Página de inicio con accesos a los tres entregables. |
| `Tablero Comercial Fail Fast.dc.html` | Tablero en vivo: embudo por sector, oportunidades entrantes, tablero semanal, meta de market share editable y **respaldo JSON**. |
| `Plan Estratégico de Ventas.dc.html` | Deck (23 láminas) del plan de ventas, bilingüe ES/EN. |
| `Estrategia Semestre · Junta.dc.html` | Deck de estrategia para junta, bilingüe ES/EN. |
| `support.js`, `deck-stage.js` | Runtime de render y motor de slides (no editar). |
| `pipeline_seed.json` | Universo de empresas objetivo (semilla del tablero). |
| `_ds/` | Design system Fail Fast (colores, tipografía, componentes). |
| `assets/` | Logos. |

## Desplegar en Vercel

1. Sube este repositorio a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New… → Project** → importa el repositorio.
3. Configuración:
   - **Framework Preset:** `Other`
   - **Build Command:** *(vacío)*
   - **Output Directory:** *(vacío / raíz)*
   - **Install Command:** *(vacío)*
4. **Deploy.** Vercel publica los archivos tal cual; la página de inicio es `index.html`.

> No requiere variables de entorno ni base de datos. React/Babel se cargan desde CDN en tiempo de ejecución, así que el sitio necesita conexión a internet para renderizar (normal en un deploy web).

## Persistencia de datos

Los datos que editas en el **Tablero** (avance de empresas, oportunidades entrantes, market share, tablero semanal) se guardan en el **`localStorage` del navegador**. En un dominio fijo de Vercel **persisten entre recargas y cierres de sesión** en ese mismo navegador.

`localStorage` es **por navegador y por dispositivo**: no se comparte entre computadores ni entre personas. Para mover o resguardar tus datos:

- **↓ Respaldo** (en el encabezado del tablero) descarga un archivo `failfast-respaldo-AAAAMMDD.json` con todo tu estado.
- **↑ Restaurar** carga ese archivo en cualquier navegador/dispositivo y reemplaza los datos locales.

> Si en el futuro quieres datos **compartidos en tiempo real** entre el equipo, se puede añadir un backend (Vercel KV/Postgres o Supabase). No está incluido en esta versión por decisión de alcance.

## Desarrollo local

Sirve la carpeta con cualquier servidor estático (no abras con `file://`, el `fetch` del seed lo bloquea):

```bash
npx serve .
# o
python3 -m http.server 8000
```

Luego abre `http://localhost:3000` (o el puerto que indique).

---

Fail Fast · failfast.ai · Confidencial
