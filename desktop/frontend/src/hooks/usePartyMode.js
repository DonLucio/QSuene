import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { partyPayload } from '../contracts/partyEvents';

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let data = {};
  try { data = await response.json(); } catch { /* respuesta sin JSON */ }
  if (!response.ok) throw new Error(data.detail || data.error || 'Error del servidor');
  return data;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function songIdentifier(song) {
  const source = normalizeText(song?.path || `${song?.artist || ''}|${song?.title || ''}`);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(36)}`;
}

function buildCatalog(songList) {
  return songList.map(song => ({
    song_id: songIdentifier(song),
    title: song.title,
    artist: song.artist || '',
    album: song.album || '',
    duration: Number(song.duration) || 0,
    rating: Math.max(0, Math.min(5, Number(song.rating) || 0)),
  }));
}

function catalogFingerprint(catalog) {
  return catalog.map(song => (
    `${song.song_id}|${song.title}|${song.artist}|${song.album}|${song.duration}|${song.rating}`
  )).join('\n');
}

function emitWithAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('El servidor de la fiesta no está conectado'));
      return;
    }
    socket.timeout(6000).emit(event, partyPayload(payload), (timeoutError, response) => {
      if (timeoutError) return reject(new Error('El servidor no respondió a tiempo'));
      if (!response?.accepted) return reject(new Error(response?.error || 'La operación fue rechazada'));
      resolve(response);
    });
  });
}

export default function usePartyMode(showToast, songList = [], onWishlistRequest = null, onLibraryReload = null) {
  const [enabled, setEnabledState] = useState(false);
  const [limit, setLimitState] = useState(3);
  const [cyclicRequests, setCyclicRequestsState] = useState(false);
  const [isPublic, setIsPublicState] = useState(false);
  const [queue, setQueue] = useState([]);

  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [serverUrl, setServerUrlState] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const socketRef = useRef(null);
  const accessRef = useRef(null);
  const catalogFingerprintRef = useRef('');
  const songsRef = useRef(songList);
  const onWishlistRequestRef = useRef(onWishlistRequest);
  const processedWishlistRequestsRef = useRef(new Set());
  const pendingWishlistAvailableRef = useRef(new Map());
  const wishlistAvailableRetryRef = useRef(null);
  const lastProgressSentAt = useRef(0);
  const latestPlaybackRef = useRef(null);
  const virtualLibraryRef = useRef([]);
  const preloadPromiseRef = useRef(null);

  useEffect(() => { songsRef.current = songList; }, [songList]);
  useEffect(() => { onWishlistRequestRef.current = onWishlistRequest; }, [onWishlistRequest]);

  const preloadVirtualLibrary = useCallback(() => {
    if (preloadPromiseRef.current) return preloadPromiseRef.current;
    const task = requestJson('/api/songs?include_party=1')
      .then(data => {
        const songs = Array.isArray(data.songs) ? data.songs : [];
        if (songs.length) virtualLibraryRef.current = songs;
        return songs;
      })
      .finally(() => { preloadPromiseRef.current = null; });
    preloadPromiseRef.current = task;
    return task;
  }, []);

  // Warm the composite library as soon as the desktop app opens. A library
  // change schedules another background snapshot without blocking the UI.
  useEffect(() => {
    if (enabled) return undefined;
    const timer = window.setTimeout(() => {
      preloadVirtualLibrary().catch(error => console.error('No se pudo precargar la biblioteca de fiesta', error));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, preloadVirtualLibrary, songList]);

  const deliverWishlistRequest = useCallback((request) => {
    if (!request?.id || processedWishlistRequestsRef.current.has(request.id)) return;
    processedWishlistRequestsRef.current.add(request.id);
    onWishlistRequestRef.current?.(request);
  }, []);

  useEffect(() => {
    Promise.all([
      requestJson('/api/party/config').then(data => setServerUrlState(data.server_url || '')),
      requestJson('/api/party/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      }),
    ]).catch(error => console.error('No se pudo inicializar la configuración de fiesta', error));
  }, []);

  const applyRoomState = useCallback((incoming) => {
    if (!incoming) return;
    if (Array.isArray(incoming.wishlist_requests)) {
      incoming.wishlist_requests.forEach(deliverWishlistRequest);
    }
    setRoom(current => {
      if (current && Number(incoming.version) < Number(current.version)) return current;
      return { ...incoming, join_url: current?.join_url };
    });
    setQueue(Array.isArray(incoming.queue) ? incoming.queue : []);
    if (Number.isFinite(Number(incoming.limit_per_guest))) {
      setLimitState(Number(incoming.limit_per_guest));
    }
    if (typeof incoming.cyclic_requests === 'boolean') {
      setCyclicRequestsState(incoming.cyclic_requests);
    }
    if (typeof incoming.is_public === 'boolean') {
      setIsPublicState(incoming.is_public);
    }
  }, [deliverWishlistRequest]);


  const disconnect = useCallback(() => {
    window.clearTimeout(wishlistAvailableRetryRef.current);
    wishlistAvailableRetryRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      window.clearInterval(socket.__djHeartbeatTimer);
      socket.disconnect();
    }
    setConnected(false);
    setConnectionError('');
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const setServerUrl = useCallback(async (nextUrl) => {
    const normalized = String(nextUrl || '').trim().replace(/\/$/, '');
    try {
      const data = await requestJson('/api/party/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_url: normalized }),
      });
      setServerUrlState(data.server_url);
      showToast('Servidor de fiestas guardado', 'success');
      return true;
    } catch (error) {
      showToast(error.message, 'error');
      return false;
    }
  }, [showToast]);

  const flushWishlistAvailable = useCallback(function flushPendingWishlist(socket = socketRef.current) {
    if (!socket?.connected) return;
    pendingWishlistAvailableRef.current.forEach((payload, requestId) => {
      const { download_item_id: downloadItemId, ...notice } = payload;
      socket.timeout(6000).emit('wishlist.available', partyPayload(notice), (timeoutError, response) => {
        if (!timeoutError && response?.accepted) {
          if (downloadItemId) {
            fetch('/api/wishlist/events/ack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemIds: [downloadItemId] }),
            }).then(localResponse => {
              if (!localResponse.ok) throw new Error('No se confirmó localmente la notificación');
              pendingWishlistAvailableRef.current.delete(requestId);
            }).catch(() => {
              // The backend operation is idempotent; retry both acknowledgments
              // until the durable desktop event can be cleared safely.
              window.clearTimeout(wishlistAvailableRetryRef.current);
              wishlistAvailableRetryRef.current = window.setTimeout(
                () => flushPendingWishlist(socketRef.current),
                3000,
              );
            });
          } else {
            pendingWishlistAvailableRef.current.delete(requestId);
          }
          return;
        }
        // Keep it pending. A reconnect or a later completed download retries it.
        setConnectionError(response?.error || 'No se confirmó la canción descargada');
        window.clearTimeout(wishlistAvailableRetryRef.current);
        wishlistAvailableRetryRef.current = window.setTimeout(
          () => flushPendingWishlist(socketRef.current),
          3000,
        );
      });
    });
  }, []);

  const openSocket = useCallback((url, access) => {
    disconnect();
    const socket = io(url, {
      auth: { token: access.token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      setConnectionError('');
      socket.timeout(6000).emit('room.snapshot.request', {}, (timeoutError, response) => {
        if (!timeoutError && response?.accepted) applyRoomState(response.state);
      });
      if (latestPlaybackRef.current) {
        socket.emit('playback.update', partyPayload({ ...latestPlaybackRef.current, progress_only: false }));
      }
      socket.emit('dj.heartbeat', {});
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', error => {
      setConnected(false);
      setConnectionError(error?.message || 'No se pudo conectar con el servidor');
      console.error('Error de conexión con Party Platform', error);
    });
    socket.on('room.state', envelope => applyRoomState(envelope?.data));
    socket.on('wishlist.requested', envelope => deliverWishlistRequest(envelope?.data));
    socket.__djHeartbeatTimer = window.setInterval(() => {
      if (socket.connected) socket.emit('dj.heartbeat', {});
    }, 15_000);
  }, [applyRoomState, deliverWishlistRequest, disconnect]);

  const setEnabled = useCallback(async (nextEnabled) => {
    if (!nextEnabled) {
      try {
        const access = accessRef.current;
        if (access && serverUrl) {
          await requestJson(`${serverUrl}/api/v1/rooms/${access.room_id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${access.token}` },
          });
        }
        await requestJson('/api/party/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: false }),
        });
      } catch (error) {
        showToast(`No se pudo actualizar el destino de descargas: ${error.message}`, 'error');
      }
      disconnect();
      accessRef.current = null;
      latestPlaybackRef.current = null;
      catalogFingerprintRef.current = '';
      processedWishlistRequestsRef.current.clear();
      pendingWishlistAvailableRef.current.clear();
      setEnabledState(false);
      setRoom(null);
      setQueue([]);
      showToast('Modo fiesta desactivado', 'info');
      return true;
    }
    if (!serverUrl) {
      showToast('Configura primero la URL del servidor de fiestas', 'error');
      return false;
    }
    // Immediate optimistic feedback: room creation continues underneath while
    // the already-warmed virtual library is used as the first catalog snapshot.
    setEnabledState(true);
    setBusy(true);
    processedWishlistRequestsRef.current.clear();
    try {
      await requestJson('/api/party/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
      let partySongs = virtualLibraryRef.current.length ? virtualLibraryRef.current : songList;
      if (!partySongs.length) partySongs = await preloadVirtualLibrary();
      if (!partySongs.length) throw new Error('La biblioteca no contiene canciones para iniciar la fiesta');
      onLibraryReload?.(partySongs);

      const access = await requestJson(`${serverUrl}/api/v1/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Fiesta Que Suene',
          dj_name: 'DJ',
          limit_per_guest: Math.max(1, Math.min(20, limit)),
          cyclic_requests: cyclicRequests,
          is_public: isPublic,
        }),
      });
      const catalog = buildCatalog(partySongs);
      await requestJson(`${serverUrl}/api/v1/rooms/${access.room_id}/catalog`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${access.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ songs: catalog }),
      });
      setRoom({
        id: access.room_id,
        code: access.room_code,
        join_url: access.join_url,
        is_public: isPublic,
        version: 0,
        participants: [],
        queue: [],
      });
      setEnabledState(true);
      openSocket(serverUrl, access);
      accessRef.current = access;
      catalogFingerprintRef.current = catalogFingerprint(catalog);
      // If the DJ activated before the warm-up finished, refresh in the
      // background and let the regular catalog effect publish the new snapshot.
      preloadVirtualLibrary().then(freshSongs => {
        if (freshSongs.length) onLibraryReload?.(freshSongs);
      }).catch(error => console.error('No se pudo actualizar la biblioteca virtual', error));
      showToast(`Fiesta ${access.room_code} creada`, 'success');
      return true;
    } catch (error) {
      requestJson('/api/party/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
      setEnabledState(false);
      showToast(`No se pudo crear la fiesta: ${error.message}`, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [cyclicRequests, disconnect, isPublic, limit, onLibraryReload, openSocket, preloadVirtualLibrary, serverUrl, showToast, songList]);

  useEffect(() => {
    const access = accessRef.current;
    if (!enabled || !connected || !access) return undefined;
    const catalog = buildCatalog(songList);
    const fingerprint = catalogFingerprint(catalog);
    if (fingerprint === catalogFingerprintRef.current) return undefined;

    const controller = new AbortController();
    setCatalogSyncing(true);
    requestJson(`${serverUrl}/api/v1/rooms/${access.room_id}/catalog`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${access.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ songs: catalog }),
      signal: controller.signal,
    })
      .then(data => {
        catalogFingerprintRef.current = fingerprint;
        const catalogLabel = data.catalog_count === 1 ? '1 canción' : `${data.catalog_count} canciones`;
        showToast(`Biblioteca de la fiesta actualizada: ${catalogLabel}`, 'success');
      })
      .catch(error => {
        if (error.name !== 'AbortError') showToast(`No se pudo actualizar la biblioteca: ${error.message}`, 'error');
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogSyncing(false);
      });
    return () => controller.abort();
  }, [connected, enabled, serverUrl, showToast, songList]);

  useEffect(() => {
    if (!enabled || !connected || pendingWishlistAvailableRef.current.size === 0) return;
    // Do not announce a download until this exact local library revision has
    // already reached the party server. The guest can then search it at once.
    const currentFingerprint = catalogFingerprint(buildCatalog(songList));
    if (currentFingerprint !== catalogFingerprintRef.current) return;
    flushWishlistAvailable();
  }, [catalogSyncing, connected, enabled, flushWishlistAvailable, songList]);

  const setPartyPublic = useCallback(async (nextValue) => {
    const normalized = Boolean(nextValue);
    const previous = isPublic;
    setIsPublicState(normalized);
    if (!enabled) return true;
    try {
      await emitWithAck(socketRef.current, 'settings.update', { is_public: normalized });
      showToast(normalized ? 'Fiesta pública activada (visible en la web)' : 'Fiesta pública desactivada (solo privada)', 'success');
      return true;
    } catch (error) {
      setIsPublicState(previous);
      showToast(error.message, 'error');
      return false;
    }
  }, [enabled, isPublic, showToast]);

  const setLimit = useCallback(async (nextLimit) => {

    const normalized = Math.max(1, Math.min(20, Number(nextLimit) || 1));
    const previous = limit;
    setLimitState(normalized);
    if (!enabled) return true;
    try {
      await emitWithAck(socketRef.current, 'room.limit.update', { limit: normalized });
      showToast(`Límite actualizado a ${normalized} por persona`, 'success');
      return true;
    } catch (error) {
      setLimitState(previous);
      showToast(error.message, 'error');
      return false;
    }
  }, [enabled, limit, showToast]);

  const setCyclicRequests = useCallback(async (nextValue) => {
    const normalized = Boolean(nextValue);
    const previous = cyclicRequests;
    setCyclicRequestsState(normalized);
    if (!enabled) return true;
    try {
      await emitWithAck(socketRef.current, 'room.cyclic.update', { cyclic_requests: normalized });
      showToast(normalized ? 'Cupo cíclico activado' : 'Cupo de una sola ocasión activado', 'success');
      return true;
    } catch (error) {
      setCyclicRequestsState(previous);
      showToast(error.message, 'error');
      return false;
    }
  }, [cyclicRequests, enabled, showToast]);

  const enqueue = useCallback(async (song) => {
    try {
      await emitWithAck(socketRef.current, 'queue.request.add', {
        song_id: songIdentifier(song),
        title: song.title,
        artist: song.artist,
      });
      showToast(`“${song.title}” programada por el DJ`, 'success');
      return true;
    } catch (error) {
      showToast(error.message, 'error');
      return false;
    }
  }, [showToast]);

  const dequeue = useCallback(async (itemId = null) => {
    const response = await emitWithAck(
      socketRef.current,
      'queue.item.consume',
      itemId ? { item_id: itemId } : {},
    );
    const item = response.item;
    if (!item) return null;

    const songs = songsRef.current;
    let song = songs.find(candidate => songIdentifier(candidate) === item.song_id);
    if (!song) {
      const requestedTitle = normalizeText(item.title);
      const requestedArtist = normalizeText(item.artist);
      song = songs.find(candidate => (
        normalizeText(candidate.title) === requestedTitle
        && (!requestedArtist || normalizeText(candidate.artist) === requestedArtist)
      ));
    }
    if (!song) {
      showToast(`No se encontró “${item.title}” en la biblioteca local`, 'error');
      return null;
    }
    return {
      ...song,
      partyRequest: {
        id: item.id,
        song_id: item.song_id,
        source: item.source,
        requested_by: item.requested_by,
        requested_by_name: item.requested_by_name,
      },
    };
  }, [showToast]);

  const removeQueueItem = useCallback(async (item) => {
    try {
      await emitWithAck(socketRef.current, 'queue.item.remove', { item_id: item.id });
      showToast(`“${item.title}” retirada de la cola`, 'info');
      return true;
    } catch (error) {
      showToast(error.message, 'error');
      return false;
    }
  }, [showToast]);

  const setParticipantBlocked = useCallback(async (participant, blocked) => {
    try {
      await emitWithAck(socketRef.current, 'participant.block.update', {
        participant_id: participant.id,
        blocked,
      });
      showToast(
        blocked ? `${participant.name} fue bloqueado` : `${participant.name} fue desbloqueado`,
        blocked ? 'info' : 'success',
      );
      return true;
    } catch (error) {
      showToast(error.message, 'error');
      return false;
    }
  }, [showToast]);

  const reorderQueue = useCallback(async (itemId, newIndex) => {
    try {
      await emitWithAck(socketRef.current, 'queue.item.reorder', {
        item_id: itemId,
        new_index: newIndex,
      });
      return true;
    } catch (error) {
      showToast(error.message, 'error');
      return false;
    }
  }, [showToast]);

  const updatePlayback = useCallback((playback, progressOnly = false) => {
    latestPlaybackRef.current = playback;
    const socket = socketRef.current;
    if (!enabled || !socket?.connected) return;
    const now = Date.now();
    if (progressOnly && now - lastProgressSentAt.current < 5000) return;
    if (progressOnly) lastProgressSentAt.current = now;
    if (progressOnly) {
      socket.emit('playback.update', partyPayload({ ...playback, progress_only: true }));
      return;
    }
    socket.timeout(6000).emit('playback.update', partyPayload({ ...playback, progress_only: false }), (timeoutError, response) => {
      if (timeoutError || !response?.accepted) {
        setConnectionError(response?.error || 'No se confirmó el estado del reproductor');
      } else {
        setConnectionError('');
      }
    });
  }, [enabled]);

  const notifyWishlistAvailable = useCallback((events = []) => {
    events.forEach(event => {
      const request = event?.request || event;
      if (!request?.partyRequestId) return;
      pendingWishlistAvailableRef.current.set(request.partyRequestId, {
        request_id: request.partyRequestId,
        title: request.title || 'La canción solicitada',
        artist: request.artist || '',
        download_item_id: event?.item_id || '',
      });
    });
  }, []);

  return {
    enabled, limit, cyclicRequests, isPublic, queue, room, connected, connectionError, serverUrl, busy, catalogSyncing,
    setEnabled, setLimit, setCyclicRequests, setPartyPublic, setServerUrl, enqueue, dequeue, removeQueueItem,
    setParticipantBlocked, reorderQueue, updatePlayback,
    notifyWishlistAvailable,
  };
}
