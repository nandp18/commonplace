import type { Collection } from './types'

export interface SyncConfig {
  owner: string
  repo: string
  path: string
  token: string
}

const CONFIG_KEY = 'commonplace.sync'

export function loadSyncConfig(): SyncConfig | null {
  try {
    const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as SyncConfig | null
    return cfg?.owner && cfg.repo && cfg.token ? cfg : null
  } catch {
    return null
  }
}

export function saveSyncConfig(cfg: SyncConfig | null) {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CONFIG_KEY)
}

class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function gh(cfg: SyncConfig, url: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${url}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      msg = (await res.json()).message ?? msg
    } catch {}
    throw new GitHubError(res.status, `GitHub ${res.status}: ${msg}`)
  }
  return res.json()
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

function utf8ToB64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

async function fetchRemote(cfg: SyncConfig): Promise<{ data: Collection | null; sha: string | null }> {
  try {
    const file = await gh(cfg, `/contents/${encPath(cfg.path)}`)
    // Files over 1 MB come back without inline content; fall back to the blob API.
    const content: string = file.content || (await gh(cfg, `/git/blobs/${file.sha}`)).content
    return { data: JSON.parse(b64ToUtf8(content)), sha: file.sha }
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return { data: null, sha: null }
    throw e
  }
}

type Rec = { id: string; createdAt: number; updatedAt: number }

function mergeRecords<T extends Rec>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>()
  for (const r of [...a, ...b]) {
    const cur = byId.get(r.id)
    if (!cur || r.updatedAt > cur.updatedAt) byId.set(r.id, r)
  }
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt || x.id.localeCompare(y.id))
}

/** Union by id; newest updatedAt wins. Output order is stable so diffs stay small. */
export function merge(local: Collection, remote: Collection | null): Collection {
  return {
    version: 1,
    books: mergeRecords(local.books, remote?.books ?? []),
    quotes: mergeRecords(local.quotes, remote?.quotes ?? []),
  }
}

const serialize = (c: Collection) => JSON.stringify(c, null, 2) + '\n'

/** Pull, merge, and push if anything changed. Returns the merged collection. */
export async function sync(cfg: SyncConfig, local: Collection): Promise<Collection> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: remote, sha } = await fetchRemote(cfg)
    const merged = merge(local, remote)
    if (remote && serialize(merged) === serialize(merge(remote, null))) return merged
    try {
      await gh(cfg, `/contents/${encPath(cfg.path)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Update quotes (${merged.quotes.filter((q) => !q.deleted).length} total)`,
          content: utf8ToB64(serialize(merged)),
          ...(sha ? { sha } : {}),
        }),
      })
      return merged
    } catch (e) {
      // Someone else wrote in between: re-fetch, re-merge, retry.
      if (e instanceof GitHubError && (e.status === 409 || e.status === 422)) continue
      throw e
    }
  }
  throw new Error('Sync conflict: please try again')
}

/** Quick check that the token can see the repo. */
export async function testConfig(cfg: SyncConfig): Promise<string> {
  const repo = await gh(cfg, '')
  if (!repo.private) return `Connected — warning: ${repo.full_name} is PUBLIC, your quotes will be visible.`
  return `Connected to ${repo.full_name} (private).`
}
