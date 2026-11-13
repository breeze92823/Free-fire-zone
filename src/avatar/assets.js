// Resilient asset loading for the avatar pipeline (skins, body parts, accessories, catalogue lookups,
// custom character rigs). Every Bloxity look is several small downloads from the CDN; with up to 18
// players that used to be hundreds of unbounded, un-timed requests, so a single stalled one left a
// character blocky for the whole round and a burst starved the browser's connection pool.
//
//   - gate(): a priority queue with a concurrency limit (local player first, prewarming last);
//   - withTimeout(): nothing waits forever;
//   - retrying(): a few attempts with backoff;
//   - a promise cache per url, evicted on failure so the next look retries instead of caching a miss.
// Nothing here throws outward except the loaders' rejected promises, which callers catch.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { TextureLoader } from 'three'

export const PRIO = { local: 0, normal: 1, warm: 2 }

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Rejects after `ms`; the underlying work may still finish in the background (its result is dropped).
export function withTimeout(promise, ms, label = 'task') {
  let timer = 0
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  })
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer))
}

// A concurrency gate: run(fn, prio) starts fn when a slot is free, lowest prio number first.
export function makeGate(limit) {
  let active = 0
  const waiting = []
  const pump = () => {
    while (active < limit && waiting.length) {
      let best = 0
      for (let i = 1; i < waiting.length; i++) if (waiting[i].prio < waiting[best].prio) best = i
      const job = waiting.splice(best, 1)[0]
      active++
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--
          pump()
        })
    }
  }
  return {
    run(fn, prio = PRIO.normal) {
      return new Promise((resolve, reject) => {
        waiting.push({ fn, prio, resolve, reject })
        pump()
      })
    },
  }
}

// fn() up to `tries` times, each with its own timeout and a backoff in between.
export async function retrying(fn, { tries = 2, timeout = 9000, backoff = 500, label = 'request' } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      return await withTimeout(fn(), timeout, label)
    } catch (err) {
      last = err
      if (i < tries - 1) await sleep(backoff * 2 ** i + Math.random() * 150)
    }
  }
  throw last
}

const netGate = makeGate(6)

// A promise cache that forgets failures (so a transient error is retried by the next look).
function cacheOf() {
  const map = new Map()
  return {
    get(key, make) {
      let entry = map.get(key)
      if (!entry) {
        entry = make()
        map.set(key, entry)
        entry.catch(() => {
          if (map.get(key) === entry) map.delete(key)
        })
      }
      return entry
    },
  }
}

const gltfLoader = new GLTFLoader()
const objLoader = new OBJLoader()
const textureLoader = new TextureLoader()
const gltfs = cacheOf()
const objs = cacheOf()
const textures = cacheOf()
const jsons = cacheOf()

export const loadGLTF = (url, { prio = PRIO.normal, tries = 2, timeout = 12000 } = {}) =>
  gltfs.get(url, () => netGate.run(() => retrying(() => gltfLoader.loadAsync(url), { tries, timeout, label: url }), prio))

export const loadOBJ = (url, { prio = PRIO.normal } = {}) => objs.get(url, () => netGate.run(() => retrying(() => objLoader.loadAsync(url), { label: url }), prio))

// `kind` picks the texture settings and is part of the cache key: the same file is a different
// texture as a skin (flipY false) and as an item map. Textures are shared by every character wearing
// them and are never disposed.
export const loadTexture = (url, kind, configure, { prio = PRIO.normal } = {}) =>
  textures.get(`${kind}|${url}`, () => netGate.run(() => retrying(() => textureLoader.loadAsync(url).then(configure), { label: url }), prio))

// JSON GET (the catalogue). Resolves null on any failure; failures are not cached.
export const loadJSON = (url, { prio = PRIO.normal } = {}) =>
  jsons
    .get(url, () =>
      netGate.run(
        () =>
          retrying(
            async () => {
              const res = await fetch(url)
              if (res.status === 404) return null // a real "no such item": answer, do not retry
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              return res.json()
            },
            { tries: 2, timeout: 6000, label: url },
          ),
        prio,
      ),
    )
    .catch(() => null)
