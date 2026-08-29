import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'

export function useGuestSocket({ apiUrl, access, notify, handlers }) {
  const [connected, setConnected] = useState(false)
  const socket = useMemo(() => access
    ? io(apiUrl, { auth: { token: access.token }, transports: ['websocket', 'polling'] })
    : null, [access, apiUrl])

  useEffect(() => {
    if (!socket) return undefined
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', event => {
      const message = event.message || 'No se pudo conectar con la fiesta'
      handlers.onConnectionError?.(message, socket)
      notify(message, 'error')
    })
    socket.on('room.state', envelope => handlers.onRoomState?.(envelope?.data, socket))
    socket.on('playback.status', envelope => handlers.onPlaybackStatus?.(envelope?.data, socket))
    socket.on('catalog.updated', envelope => handlers.onCatalogUpdated?.(envelope?.data, socket))
    socket.on('wishlist.available', envelope => handlers.onWishlistAvailable?.(envelope?.data, socket))
    socket.on('room.settings.updated', envelope => handlers.onSettingsUpdated?.(envelope?.data, socket))
    socket.on('participant.block.updated', envelope => handlers.onBlockUpdated?.(envelope?.data, socket))
    socket.on('queue.up_next', envelope => handlers.onUpNext?.(envelope?.data, socket))
    socket.on('room.closed', envelope => handlers.onRoomClosed?.(envelope?.data, socket))
    return () => { setConnected(false); socket.disconnect() }
  }, [handlers, notify, socket])

  return { socket, connected }
}
