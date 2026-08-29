import { useEffect, useState } from 'react'
import { normalizeSongText, persistPendingWishlistRequests } from '../wishlistStorage'

export function useGuestCatalog({ apiUrl, access, query, revision, pendingRequests, handledAvailable, notify, onAvailable }) {
  const [catalog, setCatalog] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!access) return undefined
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: '100' })
        const response = await fetch(`${apiUrl}/api/v1/rooms/${access.room_id}/catalog?${params}`, {
          headers: { Authorization: `Bearer ${access.token}` }, signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'No se pudo consultar la biblioteca')
        const songs = data.songs || []
        setCatalog(songs); setTotal(data.total || 0)
        for (const [requestId, requested] of pendingRequests.current) {
          const song = songs.find(item => normalizeSongText(item.title) === normalizeSongText(requested.title)
            && (!requested.artist || normalizeSongText(item.artist) === normalizeSongText(requested.artist)))
          if (!song) continue
          pendingRequests.current.delete(requestId)
          persistPendingWishlistRequests(pendingRequests.current)
          handledAvailable.current.add(requestId)
          onAvailable(song)
          break
        }
      } catch (error) {
        if (error.name !== 'AbortError') notify(error.message, 'error')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [access, apiUrl, handledAvailable, notify, onAvailable, pendingRequests, query, revision])

  return { catalog, catalogTotal: total, catalogLoading: loading }
}
