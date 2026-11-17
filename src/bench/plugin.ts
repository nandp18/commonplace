/// <reference types="node" />
/**
 * Dev-server endpoints for the OCR benchmark page (bench.html). Only active under `npm run dev`;
 * nothing here reaches the built site. Page photos and answer keys live in bench/pages, which
 * git ignores (they're photos of copyrighted books); results are written to bench/results.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { Truth } from './score'

const ROOT = new URL('../../bench/', import.meta.url).pathname
const PAGES = join(ROOT, 'pages')
const RESULTS = join(ROOT, 'results')
const SAFE_ID = /^[\w-]+$/

const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.statusCode = status
  res.setHeader('Content-Type', type)
  // Files are sent as they are on disk; only values built here are serialized.
  res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

const body = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => resolve(s))
    req.on('error', reject)
  })

const truths = (): Truth[] =>
  existsSync(PAGES)
    ? readdirSync(PAGES)
        .filter((f) => f.endsWith('.json') && !f.endsWith('.chandra.json'))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(PAGES, f), 'utf8')))
    : []

function git(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
    const dirty = execSync('git status --porcelain -- ../src', { cwd: ROOT }).toString().trim() !== ''
    return { commit, dirty }
  } catch {
    return { commit: 'unknown', dirty: true }
  }
}

export function bench(): Plugin {
  return {
    name: 'commonplace-bench',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/bench-api', async (req, res) => {
        try {
          const [, what, arg] = (req.url ?? '').split('?')[0].split('/')
          if (req.method === 'GET' && what === 'pages') return send(res, 200, truths().map((t) => ({ ...t, hasChandra: existsSync(join(PAGES, `${t.id}.chandra.json`)) })))

          if (req.method === 'GET' && what === 'file' && arg && /^[\w.-]+$/.test(arg) && !arg.startsWith('.')) {
            const path = join(PAGES, arg)
            if (!existsSync(path)) return send(res, 404, { error: 'no such file' })
            return send(res, 200, readFileSync(path), arg.endsWith('.json') ? 'application/json' : 'image/jpeg')
          }

          if (req.method === 'POST' && what === 'truth' && arg && SAFE_ID.test(arg)) {
            const path = join(PAGES, `${arg}.json`)
            if (!existsSync(path)) return send(res, 404, { error: 'no such page' })
            const old: Truth = JSON.parse(readFileSync(path, 'utf8'))
            const edit = JSON.parse(await body(req)) as Partial<Truth>
            // Only the transcription can change here; which photo and language it is stays fixed.
            const next: Truth = {
              id: old.id,
              lang: old.lang,
              photo: old.photo,
              lines: (edit.lines ?? old.lines).map((l) => l.normalize('NFC')),
              pageNumber: edit.pageNumber?.trim() || undefined,
              verified: edit.verified ?? old.verified,
              unsure: edit.unsure ?? old.unsure,
              notes: edit.notes?.trim() || undefined,
              draftFrom: edit.draftFrom ?? old.draftFrom,
            }
            writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
            return send(res, 200, next)
          }

          if (req.method === 'POST' && what === 'chandra' && arg && SAFE_ID.test(arg) && existsSync(join(PAGES, `${arg}.json`))) {
            const raw = await body(req)
            JSON.parse(raw) // refuse anything that isn't JSON
            writeFileSync(join(PAGES, `${arg}.chandra.json`), raw)
            return send(res, 200, { saved: true })
          }

          if (req.method === 'POST' && what === 'results') {
            mkdirSync(RESULTS, { recursive: true })
            const run = { ...JSON.parse(await body(req)), ...git(), at: new Date().toISOString() }
            const file = `${run.at.replace(/[:.]/g, '-')}-${run.engine}.json`
            writeFileSync(join(RESULTS, file), JSON.stringify(run, null, 1) + '\n')
            return send(res, 200, { file })
          }

          if (req.method === 'GET' && what === 'latest' && arg && SAFE_ID.test(arg)) {
            const files = existsSync(RESULTS) ? readdirSync(RESULTS).filter((f) => f.endsWith(`-${arg}.json`)).sort() : []
            if (files.length === 0) return send(res, 404, { error: 'no runs yet' })
            return send(res, 200, JSON.parse(readFileSync(join(RESULTS, files[files.length - 1]), 'utf8')))
          }

          send(res, 404, { error: 'unknown bench endpoint' })
        } catch (e) {
          send(res, 500, { error: String(e) })
        }
      })
    },
  }
}
