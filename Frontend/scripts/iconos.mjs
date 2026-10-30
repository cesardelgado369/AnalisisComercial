// Recorta la fuente de íconos a los que usa la app (rendimiento en el celular: la fuente entera pesa varios MB).
// Junta todo texto de JSX o literal de string de `src/` que sea un nombre oficial de Material Symbols y lo escribe en
// el `icon_names=` de index.html (sobra algún falso positivo, como «title»; no falta ninguno).
// Uso: `npm run iconos` cada vez que se suma un ícono nuevo (si no, se ve su nombre en texto en lugar del dibujo).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(raiz, 'node_modules', '.cache', 'material-symbols.codepoints')
const URL_CODEPOINTS =
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints'

if (!existsSync(cache)) {
  const r = await fetch(URL_CODEPOINTS)
  if (!r.ok) throw new Error(`No se pudo bajar la lista de íconos (${r.status})`)
  mkdirSync(dirname(cache), { recursive: true })
  writeFileSync(cache, await r.text())
}
const oficiales = new Set(readFileSync(cache, 'utf8').split('\n').map((l) => l.split(' ')[0]).filter(Boolean))

const usados = new Set()
const recorrer = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) recorrer(p)
    else if (/\.(tsx?|jsx?)$/.test(n)) {
      for (const m of readFileSync(p, 'utf8').matchAll(/['"`>]\s*([a-z][a-z0-9_]{1,40})\s*['"`<]/g)) {
        if (oficiales.has(m[1])) usados.add(m[1])
      }
    }
  }
}
recorrer(join(raiz, 'src'))

const lista = [...usados].sort().join(',')
const index = join(raiz, 'index.html')
const html = readFileSync(index, 'utf8')
if (!/icon_names=[^&"]*/.test(html)) throw new Error('index.html no tiene el parámetro icon_names= en la fuente de íconos')
writeFileSync(index, html.replace(/icon_names=[^&"]*/, `icon_names=${lista}`))
console.log(`${usados.size} íconos en index.html`)
