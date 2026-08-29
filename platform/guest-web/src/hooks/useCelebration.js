import { useCallback, useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'

const STORAGE_KEY = 'que-suene-party-celebrated-requests'
const MEMORY_MS = 15 * 60 * 1000

function loadRecent() {
  const now = Date.now()
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}')
    return new Map(Object.entries(stored).filter(([, timestamp]) => now - Number(timestamp) < MEMORY_MS))
  } catch {
    return new Map()
  }
}

function persistRecent(requests) {
  const now = Date.now()
  const recent = [...requests.entries()].filter(([, timestamp]) => now - Number(timestamp) < MEMORY_MS)
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)))
}

export function useCelebration(access) {
  const [celebration, setCelebration] = useState(null)
  const timer = useRef(null)
  const celebrated = useRef(loadRecent())

  const celebrateOwnSong = useCallback((playback) => {
    const current = playback?.current
    if (!playback?.playing || !current?.title || current.requested_by !== access?.participant_id) return
    const queueItemId = String(current.queue_item_id || '').trim()
    if (!queueItemId) return
    const requestKey = `${access.room_id}:${queueItemId}`
    if (celebrated.current.has(requestKey)) return
    const overlayDurationMs = Math.max(0, 7000 - Number(playback.position_ms || 0))
    if (!overlayDurationMs) return
    celebrated.current.set(requestKey, Date.now())
    persistRecent(celebrated.current)
    window.clearTimeout(timer.current)
    setCelebration({ ...current, overlayDurationMs })
    timer.current = window.setTimeout(() => setCelebration(null), overlayDurationMs)
  }, [access?.participant_id, access?.room_id])

  useEffect(() => {
    if (!celebration) return undefined
    const colors = ['#f97316', '#fb923c', '#06b6d4', '#fde047', '#f472b6', '#a7f3d0']
    confetti({ particleCount: 190, spread: 125, startVelocity: 52, gravity: .9, scalar: 1.05,
      origin: { x: .5, y: .55 }, colors, zIndex: 101, disableForReducedMotion: true })
    let side = false
    const cannon = window.setInterval(() => {
      side = !side
      confetti({ particleCount: 42, angle: side ? 60 : 120, spread: 62, startVelocity: 48,
        origin: { x: side ? 0 : 1, y: .72 }, colors, zIndex: 101, disableForReducedMotion: true })
    }, 430)
    return () => { window.clearInterval(cannon); confetti.reset() }
  }, [celebration])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { celebration, celebrateOwnSong }
}
