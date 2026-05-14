import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(scriptDir, '..')
const nuxtDist = join(frontendDir, 'dist')
const legacyPublic = join(frontendDir, '.output', 'public')

if (existsSync(legacyPublic)) {
  process.exit(0)
}

if (existsSync(nuxtDist)) {
  mkdirSync(dirname(legacyPublic), { recursive: true })
  cpSync(nuxtDist, legacyPublic, { recursive: true })
  process.exit(0)
}

throw new Error(`Nuxt generate did not produce ${nuxtDist} or ${legacyPublic}`)
