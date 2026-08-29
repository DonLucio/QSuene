import { useCallback, useEffect, useState } from 'react'

export function useAssistedSearch({ apiUrl, access, query, onResolved, notify }) {
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState([])
  const [attribution, setAttribution] = useState(null)
  const [resolvingKey, setResolvingKey] = useState('')

  useEffect(() => {
    setStatus('idle')
    setResults([])
    setAttribution(null)
    setResolvingKey('')
  }, [query])

  const search = useCallback(async () => {
    const normalizedQuery = query.trim()
    if (!access || normalizedQuery.length < 2) return
    setStatus('loading')
    try {
      const params = new URLSearchParams({ q: normalizedQuery, limit: '20' })
      const response = await fetch(`${apiUrl}/api/v1/rooms/${access.room_id}/discovery?${params}`, {
        headers: { Authorization: `Bearer ${access.token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'No fue posible ampliar la búsqueda')
      setResults(data.results || [])
      setAttribution(data.attribution || null)
      setStatus(data.results?.length ? 'results' : 'empty')
    } catch (error) {
      setStatus('error')
      notify(error.message, 'error')
    }
  }, [access, apiUrl, notify, query])

  const resolve = useCallback(async (song) => {
    if (!access || resolvingKey) return
    const key = `${song.artist}|${song.title}`
    setResolvingKey(key)
    try {
      const response = await fetch(`${apiUrl}/api/v1/rooms/${access.room_id}/discovery/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(), title: song.title, artist: song.artist,
          provider: song.provider || 'lastfm', provider_url: song.provider_url || '',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'No fue posible procesar la canción')
      onResolved(data)
      setStatus('resolved')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setResolvingKey('')
    }
  }, [access, apiUrl, notify, onResolved, query, resolvingKey])

  return { status, results, attribution, resolvingKey, search, resolve }
}
