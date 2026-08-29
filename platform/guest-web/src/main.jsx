import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fortawesome/fontawesome-free/css/all.min.css'
import LandingPage from './LandingPage'
import JoinPage from './JoinPage'
import GuestPartyPage from './GuestPartyPage'
import AssistedSearch from './AssistedSearch'
import './styles.css'
import { versioned } from './socketContract'
import { useCelebration } from './hooks/useCelebration'
import { useGuestCatalog } from './hooks/useGuestCatalog'
import { useGuestSocket } from './hooks/useGuestSocket'
import { useAssistedSearch } from './hooks/useAssistedSearch'
import { loadPendingWishlistRequests, persistPendingWishlistRequests } from './wishlistStorage'


const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin)
const DEVICE_ID_KEY = 'que-suene-party-device-id'
const GUEST_NAME_KEY = 'que-suene-party-guest-name'

function getDeviceId() {
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = window.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

function App() {
  const initialCode = new URLSearchParams(window.location.search).get('room') || ''
  const deviceId = useMemo(getDeviceId, [])
  const [roomCode, setRoomCode] = useState(initialCode)
  const [guestName, setGuestName] = useState(() => window.localStorage.getItem(GUEST_NAME_KEY) || '')

  const [access, setAccess] = useState(null)
  const [room, setRoom] = useState(null)
  const [error, setError] = useState('')
  const [closedNotice, setClosedNotice] = useState('')
  const [query, setQuery] = useState('')
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [activeView, setActiveView] = useState('library')
  const [notification, setNotification] = useState(null)
  const [upNextNotice, setUpNextNotice] = useState(null)
  const [countdownNow, setCountdownNow] = useState(Date.now())
  const [acceptedSongIds, setAcceptedSongIds] = useState(() => new Set())
  const [acknowledgedUsage, setAcknowledgedUsage] = useState(null)
  const notificationTimer = useRef(null)
  const playbackSyncAt = useRef(Date.now())
  const playbackSignature = useRef('')
  const notifiedUpNext = useRef('')
  const pendingWishlistRequests = useRef(loadPendingWishlistRequests())
  const handledWishlistAvailable = useRef(new Set())
  const roomVersion = useRef(0)

  const notify = useCallback((message, type = 'personal') => {
    window.clearTimeout(notificationTimer.current)
    setNotification({ message, type })
    notificationTimer.current = window.setTimeout(() => setNotification(null), 6000)
  }, [])

  const revealFocusedField = useCallback((event) => {
    const field = event.currentTarget.closest('.search-field, .wishlist-request-form label')
    const reveal = () => field?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.requestAnimationFrame(reveal)
    // En móviles el viewport cambia después de que aparece el teclado.
    window.setTimeout(reveal, 320)
  }, [])

  const returnToLanding = useCallback((notice = '') => {
    setAccess(null)
    setRoom(null)
    setRoomCode('')
    setError('')
    setClosedNotice(notice)
    const cleanUrl = `${window.location.origin}${window.location.pathname}`
    window.history.replaceState(null, '', cleanUrl)
  }, [])

  const catalogAvailable = useCallback((song) => {
    setQuery(song.title)
    setActiveView('library')
    notify(`¡Ya está disponible “${song.title}”! Ya puedes agregarla a la cola.`)
  }, [notify])

  const { catalog, catalogTotal, catalogLoading } = useGuestCatalog({
    apiUrl: API_URL, access, query, revision: catalogRevision,
    pendingRequests: pendingWishlistRequests, handledAvailable: handledWishlistAvailable,
    notify, onAvailable: catalogAvailable,
  })

  const handleAssistedResolution = useCallback((data) => {
    if (data.state) {
      roomVersion.current = Math.max(roomVersion.current, Number(data.state.version) || 0)
      setRoom(data.state)
    }
    if (Number.isFinite(Number(data.requests_used))) setAcknowledgedUsage(Number(data.requests_used))
    if (data.resolution === 'queued') {
      if (data.result?.song_id) setAcceptedSongIds(current => new Set(current).add(data.result.song_id))
      notify(`✓ “${data.result?.title || 'La canción'}” fue agregada a la cola.`)
      return
    }
    if (data.resolution === 'wishlist_requested' && data.result?.id) {
      pendingWishlistRequests.current.set(data.result.id, {
        title: data.result.title, artist: data.result.artist,
      })
      persistPendingWishlistRequests(pendingWishlistRequests.current)
      notify(`✓ Solicitud enviada al DJ: ${data.result.title} · ${data.result.artist}`)
    }
  }, [notify])

  const assistedSearch = useAssistedSearch({
    apiUrl: API_URL, access, query, onResolved: handleAssistedResolution, notify,
  })

  useEffect(() => () => {
    window.clearTimeout(notificationTimer.current)
  }, [])

  useEffect(() => {
    setAcceptedSongIds(new Set())
    setAcknowledgedUsage(null)
    roomVersion.current = 0
  }, [access?.room_id, access?.participant_id])

  // El evento de reproducción puede llegar primero como "cargando/pausado" y
  // enseguida como "reproduciendo". La sala es la fuente de verdad: al ver por
  // primera vez una solicitud propia en reproducción, celebramos una sola vez.
  const { celebration, celebrateOwnSong } = useCelebration(access)

  const handleWishlistAvailable = useCallback((available, activeSocket) => {
    if (!available?.request_id || available.requested_by !== access?.participant_id) return
    const alreadyHandled = handledWishlistAvailable.current.has(available.request_id)
    handledWishlistAvailable.current.add(available.request_id)
    pendingWishlistRequests.current.delete(available.request_id)
    persistPendingWishlistRequests(pendingWishlistRequests.current)
    if (!alreadyHandled) {
      setCatalogRevision(revision => revision + 1)
      setQuery(available.title || '')
      setActiveView('library')
      notify(`¡Ya está disponible “${available.title}”! Ya puedes agregarla a la cola.`)
    }
    activeSocket?.emit('wishlist.available.ack', versioned({ request_id: available.request_id }), () => {})
  }, [access?.participant_id, notify])

  const socketHandlers = useMemo(() => ({
    onRoomState: (incoming, activeSocket) => {
      if (!incoming || Number(incoming.version) < roomVersion.current) return
      roomVersion.current = Number(incoming.version) || roomVersion.current
      const signature = JSON.stringify(incoming.playback || {})
      if (signature !== playbackSignature.current) {
        playbackSignature.current = signature
        playbackSyncAt.current = Date.now()
      }
      setRoom(incoming)
      const participant = incoming.participants?.find(item => item.id === access?.participant_id)
      const pending = incoming.queue?.filter(item => item.requested_by === access?.participant_id).length || 0
      setAcknowledgedUsage(incoming.cyclic_requests ? pending : Number(participant?.requests_made || 0))
      setAcceptedSongIds(current => {
        if (!current.size) return current
        const queuedIds = new Set(incoming.queue?.map(item => item.song_id) || [])
        return new Set([...current].filter(songId => !queuedIds.has(songId)))
      })
      celebrateOwnSong(incoming.playback)
      ;(incoming.wishlist_available || []).forEach(notice => handleWishlistAvailable(notice, activeSocket))
    },
    onPlaybackStatus: (status) => {
      if (!status?.title) return
      // Respaldo para servidores que entregan el evento dedicado antes del
      // siguiente snapshot de sala.
      celebrateOwnSong({
        current: status.requested_by ? {
          song_id: status.song_id || status.title,
          queue_item_id: status.queue_item_id,
          title: status.title,
          artist: status.artist,
          requested_by: status.requested_by,
        } : null,
        position_ms: status.position_ms,
        playing: status.playing,
      })
    },
    onCatalogUpdated: () => {
      setCatalogRevision(revision => revision + 1)
      // Permite detectar una descarga propia aunque se haya perdido el evento
      // dirigido: se consulta el catálogo completo una sola vez.
      if (pendingWishlistRequests.current.size) setQuery('')
    },
    onWishlistAvailable: handleWishlistAvailable,
    onSettingsUpdated: (settings) => {
      const changed = settings?.changed
      const nextLimit = settings?.limit_per_guest
      if (changed === 'cyclic_requests') {
        notify(settings?.cyclic_requests
          ? 'El DJ activó el cupo cíclico: se liberan espacios al sonar tus canciones'
          : 'El DJ cambió el cupo a una sola ocasión', 'general')
      } else if (Number.isFinite(nextLimit)) {
        notify(`El DJ cambió el límite a ${nextLimit} ${nextLimit === 1 ? 'canción' : 'canciones'} por persona`, 'general')
      }
    },
    onBlockUpdated: (update) => {
      if (update?.participant_id !== access.participant_id) return
      notify(update.blocked
        ? 'El DJ bloqueó temporalmente tus nuevas solicitudes'
        : 'El DJ volvió a habilitar tus solicitudes', 'personal')
    },
    onUpNext: (upcoming) => {
      if (!upcoming || upcoming.requested_by !== access.participant_id) return
      notifiedUpNext.current = upcoming.item_id
      setUpNextNotice(upcoming)
      setCountdownNow(Date.now())
    },
    onRoomClosed: () => {
      returnToLanding('La fiesta terminó porque el DJ se desconectó.')
    },
    onConnectionError: (message) => {
      if (!/sala (está )?cerrada|sala no encontrada/i.test(String(message))) return
      returnToLanding('La fiesta ya terminó y la sala fue cerrada.')
    },
  }), [access?.participant_id, celebrateOwnSong, handleWishlistAvailable, notify, returnToLanding])
  const { socket, connected } = useGuestSocket({ apiUrl: API_URL, access, notify, handlers: socketHandlers })

  const nextQueuedItem = room?.queue?.[0] || null
  const playback = room?.playback || {}
  const playbackElapsed = playback.playing ? Math.max(0, countdownNow - playbackSyncAt.current) : 0
  const playbackPositionMs = Math.min(
    Number(playback.duration_ms || 0) || Number.MAX_SAFE_INTEGER,
    Math.max(0, Number(playback.position_ms || 0) + playbackElapsed),
  )
  const playbackRemainingMs = Math.max(0, Number(playback.duration_ms || 0) - Number(playback.position_ms || 0) - playbackElapsed)
  const playbackProgress = Number(playback.duration_ms) > 0
    ? Math.min(100, (playbackPositionMs / Number(playback.duration_ms)) * 100)
    : 0
  const upcomingSeconds = Math.max(0, Math.ceil(playbackRemainingMs / 1000))
  const ownSongIsNext = Boolean(nextQueuedItem && nextQueuedItem.requested_by === access?.participant_id)
  const showUpNext = Boolean(
    upNextNotice
    && nextQueuedItem?.id === upNextNotice.item_id
    && playback.playing
    && upcomingSeconds > 0
    && upcomingSeconds <= 15
  )

  useEffect(() => {
    if (!playback.playing || !ownSongIsNext || playbackRemainingMs <= 0 || playbackRemainingMs > 15_000) return
    if (notifiedUpNext.current === nextQueuedItem.id) return
    notifiedUpNext.current = nextQueuedItem.id
    const upcoming = {
      item_id: nextQueuedItem.id,
      title: nextQueuedItem.title,
      requested_by: nextQueuedItem.requested_by,
    }
    setUpNextNotice(upcoming)
  }, [nextQueuedItem, ownSongIsNext, playback.playing, playbackRemainingMs])

  useEffect(() => {
    if (upNextNotice && nextQueuedItem?.id !== upNextNotice.item_id) setUpNextNotice(null)
  }, [nextQueuedItem?.id, upNextNotice])

  useEffect(() => {
    if (!playback.playing) return undefined
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [playback.playing])

  async function join(event) {
    event.preventDefault()
    setError('')
    if (!roomCode.trim()) {
      setError('Abre el acceso desde el código QR mostrado por el DJ')
      return
    }
    const response = await fetch(`${API_URL}/api/v1/rooms/${roomCode.trim().toUpperCase()}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_name: guestName.trim(), device_id: deviceId }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.detail || 'No fue posible entrar a la sala')
      return
    }
    window.localStorage.setItem(GUEST_NAME_KEY, guestName.trim())
    setAccess(data)
  }

  function requestSong(song) {
    setError('')
    socket.emit('queue.request.add', versioned({ song_id: song.song_id }), (result) => {
      if (!result?.accepted) {
        notify(result?.error || 'No fue posible agregar la canción', 'error')
        return
      }
      setAcceptedSongIds(current => new Set(current).add(song.song_id))
      window.setTimeout(() => {
        setAcceptedSongIds(current => {
          if (!current.has(song.song_id)) return current
          const next = new Set(current)
          next.delete(song.song_id)
          return next
        })
      }, 5000)
      if (Number.isFinite(Number(result.requests_used))) {
        setAcknowledgedUsage(Number(result.requests_used))
      }
      // Apply the authoritative quota and queue in the ACK itself. The regular
      // room.state broadcast remains a second delivery path for every client.
      if (result?.state && Number(result.state.version) >= roomVersion.current) {
        roomVersion.current = Number(result.state.version) || roomVersion.current
        setRoom(result.state)
      }
    })
  }

  const ownParticipant = room?.participants?.find(participant => participant.id === access?.participant_id)
  const isBlocked = Boolean(ownParticipant?.blocked)
  const ownPendingRequests = room?.queue?.filter(item => item.requested_by === access?.participant_id).length || 0
  const roomRequestsUsed = room?.cyclic_requests ? ownPendingRequests : Number(ownParticipant?.requests_made || 0)
  const requestsUsed = acknowledgedUsage == null ? roomRequestsUsed : Math.max(roomRequestsUsed, acknowledgedUsage)
  const requestLimit = Number(room?.limit_per_guest || 0)
  const quotaReached = Boolean(room && requestLimit > 0 && requestsUsed >= requestLimit)

  if (!access) {
    if (!roomCode.trim()) {
      return (
        <LandingPage 
          onJoinRoom={(code) => {
            setClosedNotice('');
            setRoomCode(code);
            setError('');
          }} 
          apiUrl={API_URL}
          notice={closedNotice}
        />
      );
    }

    return <JoinPage roomCode={roomCode} guestName={guestName} setGuestName={setGuestName} error={error} onJoin={join} onBack={() => returnToLanding()} />
  }


  return (
    <GuestPartyPage notification={notification} showUpNext={showUpNext} upNextNotice={upNextNotice}
      upcomingSeconds={upcomingSeconds} celebration={celebration} playback={playback}
      connected={connected} playbackPositionMs={playbackPositionMs} playbackProgress={playbackProgress}
      nextQueuedItem={nextQueuedItem} guestName={guestName} activeView={activeView}
      onViewChange={setActiveView} queueCount={room?.queue?.length || 0}>

      {activeView === 'queue' && <section className="view-section">
        <div className="section-title"><h2>Próximamente</h2><span>{room?.queue?.length || 0}</span></div>
        <div className="queue">
          {room?.queue?.map((item, index) => (
            <article className="queue-item" key={item.id}>
              <span className="position">{index + 1}</span>
              <div><strong>{item.title}</strong><p>{item.artist || 'Artista desconocido'} · {item.source === 'dj' ? 'DJ' : item.requested_by_name}</p></div>
            </article>
          ))}
          {!room?.queue?.length && <p className="empty">Todavía no hay solicitudes.</p>}
        </div>
      </section>}

      {activeView === 'library' && isBlocked && <section className="view-section quota-locked guest-blocked" role="status">
        <div className="quota-lock-icon"><i className="fa-solid fa-ban"></i></div>
        <p className="eyebrow">SOLICITUDES BLOQUEADAS</p>
        <h2>El DJ pausó tus solicitudes</h2>
        <p>Puedes seguir viendo la cola y el estado de la fiesta, pero por ahora no podrás pedir canciones ni solicitar descargas.</p>
      </section>}

      {activeView === 'library' && !isBlocked && quotaReached && <section className="view-section quota-locked" role="status">
        <div className="quota-lock-icon"><i className={`fa-solid ${room?.cyclic_requests ? 'fa-hourglass-half' : 'fa-lock'}`}></i></div>
        <p className="eyebrow">CUPO COMPLETO</p>
        <h2>{room?.cyclic_requests ? 'Tus canciones están programadas' : 'Ya utilizaste tus solicitudes'}</h2>
        <p>{room?.cyclic_requests
          ? 'Cuando comience una de tus canciones se liberará un cupo y podrás volver a pedir.'
          : `Alcanzaste el límite de ${requestLimit}. En esta fiesta no podrás pedir más canciones.`}</p>
        <div className="quota-meter"><i style={{ width: '100%' }}></i></div>
        <small>{requestsUsed} de {requestLimit} utilizadas · {room?.cyclic_requests ? 'Modo cíclico' : 'Una sola ocasión'}</small>
      </section>}

      {activeView === 'library' && !isBlocked && !quotaReached && <section className="view-section catalog-card">
        <div className="section-title"><div><p className="eyebrow">ELIGE LA PRÓXIMA</p><h2>Biblioteca</h2></div><span>{catalogTotal}</span></div>
        <p className="guest-limit" aria-live="polite"><span>{room?.cyclic_requests ? 'Cupo cíclico disponible' : 'Cupo de una sola ocasión'}</span><strong>{Math.max(0, requestLimit - requestsUsed)} / {requestLimit || '—'}</strong></p>
        <label className="search-field">
          <span className="sr-only">Buscar canción, artista o álbum</span>
          <b aria-hidden="true">⌕</b>
          <input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={revealFocusedField} placeholder="Buscar canción, artista o álbum…" />
        </label>
        <div className="catalog-list">
          {catalog.map(song => {
            const alreadyQueued = acceptedSongIds.has(song.song_id) || room?.queue?.some(item => item.song_id === song.song_id)
            const guestRequestCount = Number(room?.guest_song_request_counts?.[song.song_id] ?? song.guest_request_count ?? 0)
            const guestRequestLimit = Number(song.guest_request_limit || 2)
            const requestLimitReached = guestRequestCount >= guestRequestLimit
            const unavailableLabel = requestLimitReached
              ? `${song.title} ya alcanzó el máximo de ${guestRequestLimit} solicitudes`
              : `${song.title} ya está programada`
            return (
              <article className={`catalog-item ${requestLimitReached ? 'is-request-limited' : ''}`} key={song.song_id}>
                <div><strong>{song.title}</strong><p>{song.artist || 'Artista desconocido'}{song.album ? ` · ${song.album}` : ''}</p>{requestLimitReached && <small className="song-request-limit">Máximo alcanzado · {guestRequestLimit} solicitudes</small>}</div>
                <button className="add-song" aria-label={(alreadyQueued || requestLimitReached) ? unavailableLabel : `Agregar ${song.title}`} disabled={!connected || alreadyQueued || requestLimitReached} onClick={() => requestSong(song)}>
                  {requestLimitReached
                    ? <i className="fa-solid fa-ban" aria-hidden="true"></i>
                    : <i className={`fa-solid ${alreadyQueued ? 'fa-check' : 'fa-plus'}`} aria-hidden="true"></i>}
                </button>
              </article>
            )
          })}
          {catalogLoading && <p className="empty">Buscando…</p>}
          {!catalogLoading && !catalog.length && query.trim().length >= 2 && <p className="empty local-empty">No está disponible en la biblioteca actual.</p>}
        </div>
        {!catalogLoading && <AssistedSearch query={query} assisted={assistedSearch} disabled={!connected || isBlocked} />}
        {catalogTotal > catalog.length && <p className="muted result-note">Mostrando las primeras {catalog.length} canciones. Usa la búsqueda para filtrar.</p>}
        {error && <p className="error">{error}</p>}
      </section>}

    </GuestPartyPage>
  )
}

createRoot(document.getElementById('root')).render(<App />)
