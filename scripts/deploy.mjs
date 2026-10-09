/**
 * Despliega el Worker diciendo QUÉ se despliega: el commit y la versión viajan como
 * variables, y el Worker los enseña en `/version` (CONVENCIONES §15).
 *
 * Se para si hay cambios sin commitear o sin subir: el commit que anuncia el Worker
 * tiene que existir en `main`, o `dotrino-index` no puede decir cuánto va por detrás.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (git('status', '--porcelain')) {
  console.error('deploy: uncommitted changes — commit first, the Worker announces a commit')
  process.exit(1)
}
git('fetch', '--quiet', 'origin', 'main')
if (git('rev-list', '--count', 'origin/main..HEAD') !== '0') {
  console.error('deploy: HEAD is not on origin/main — push first')
  process.exit(1)
}

const commit = git('rev-parse', '--short', 'HEAD')
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

execFileSync('npx', ['wrangler', 'deploy', '--var', `COMMIT:${commit}`, '--var', `VERSION:${version}`], { stdio: 'inherit' })
console.log(`deployed shortener ${version} (${commit})`)
