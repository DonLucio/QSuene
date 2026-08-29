import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_WISHLIST = 5;

export default function useWishlistDownloads({ setSongList, showToast, onAutoStart, onCompleted }) {
  const [wishlist, setWishlist] = useState([]);
  const [isDownloadActive, setIsDownloadActive] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const completedThisRunRef = useRef(0);
  const completedPartyRequestsRef = useRef([]);
  const downloadActiveRef = useRef(false);

  const refreshWishlist = useCallback(() => (
    fetch('/api/wishlist')
      .then(response => response.json())
      .then(data => {
        const visible = (data.wishlist || []).filter(item => item.status !== 'completed');
        setWishlist(visible);
        return visible;
      })
  ), []);

  const refreshLibrary = useCallback((includeParty = false) => (
    fetch(`/api/songs${includeParty ? '?include_party=true' : ''}`, { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        if (data.songs) setSongList(data.songs);
      })
  ), [setSongList]);

  const mergeCompletedSongs = useCallback((songs = []) => {
    if (!songs.length) return;
    setSongList(previous => {
      const byPath = new Map(previous.map(song => [String(song.path || '').toLowerCase(), song]));
      songs.forEach(song => {
        if (song?.path) byPath.set(String(song.path).toLowerCase(), song);
      });
      return [...byPath.values()].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
    });
  }, [setSongList]);

  useEffect(() => {
    refreshWishlist().catch(console.error);
  }, [refreshWishlist]);

  const startDownload = useCallback(async () => {
    if (downloadActiveRef.current) return true;
    downloadActiveRef.current = true;
    completedThisRunRef.current = 0;
    completedPartyRequestsRef.current = [];
    setIsDownloadActive(true);
    try {
      const response = await fetch('/api/wishlist/download', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        downloadActiveRef.current = false;
        setIsDownloadActive(false);
        if (data.error) showToast(data.error, 'error');
        return false;
      }
      return true;
    } catch (error) {
      console.error(error);
      downloadActiveRef.current = false;
      setIsDownloadActive(false);
      showToast('No se pudo iniciar la descarga', 'error');
      return false;
    }
  }, [showToast]);

  const completeDownload = useCallback(async (completedCount, destination = 'library') => {
    downloadActiveRef.current = false;
    setIsDownloadActive(false);
    setDownloadProgress('');
    try {
      await refreshWishlist();
    } catch (error) {
      console.error(error);
      showToast('La descarga terminó, pero no se pudo refrescar la biblioteca', 'error');
      return;
    }
    showToast(
      destination === 'party'
        ? `✓ ${completedCount} canción${completedCount !== 1 ? 'es' : ''} descargada${completedCount !== 1 ? 's' : ''} en ModoFiesta`
        : `✓ ${completedCount} canción${completedCount !== 1 ? 'es' : ''} descargada${completedCount !== 1 ? 's' : ''} y añadida${completedCount !== 1 ? 's' : ''} a la biblioteca`,
      'success'
    );
    // Reconciliation is no longer on the critical path. Each completed song
    // was already merged from the worker event; this scan only corrects drift.
    window.setTimeout(() => refreshLibrary(destination === 'party').catch(console.error), 1200);
  }, [refreshLibrary, refreshWishlist, showToast]);

  useEffect(() => {
    if (!isDownloadActive) return undefined;
    let cancelled = false;
    let pollTimer = null;
    let activeRequest = null;

    const poll = async () => {
      activeRequest = new AbortController();
      const requestTimeout = window.setTimeout(() => activeRequest?.abort(), 5000);
      try {
        const response = await fetch(`/api/wishlist/status?_=${Date.now()}`, {
          cache: 'no-store',
          signal: activeRequest.signal,
        });
        const data = await response.json();
        if (cancelled) return;
          if (data.wishlist) setWishlist(data.wishlist.filter(item => item.status !== 'completed'));
          if (!data.summary) return;

          const { isActive, needsReindex, completedCount, completedPartyRequests = [], completedSongs = [], currentProgress = 0, currentStage = '', destination } = data.summary;
          if (isActive) setDownloadProgress(currentProgress > 0 ? `${currentProgress}%` : (currentStage || '…'));
            if (needsReindex && completedCount > 0) {
              completedThisRunRef.current += completedCount;
              completedPartyRequestsRef.current.push(...completedPartyRequests);
              mergeCompletedSongs(completedSongs);
              refreshWishlist().catch(console.error);
              if (completedPartyRequests.length) onCompleted?.(completedPartyRequests);
              showToast(
                completedCount === 1 ? 'Canción disponible' : `${completedCount} canciones disponibles`,
                'success',
              );
          }
          if (!isActive) {
            downloadActiveRef.current = false;
            setIsDownloadActive(false);
            setDownloadProgress('');
            const completedTotal = completedThisRunRef.current;
            if (completedTotal > 0) {
              completeDownload(completedTotal, destination);
            }
          }
      } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
      } finally {
        window.clearTimeout(requestTimeout);
        activeRequest = null;
        if (!cancelled && downloadActiveRef.current) {
          pollTimer = window.setTimeout(poll, 750);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
      activeRequest?.abort();
    };
  }, [completeDownload, isDownloadActive, mergeCompletedSongs, onCompleted, refreshWishlist, showToast]);

  const addWishlistItem = useCallback(async (item, options = {}) => {
    try {
      const response = await fetch('/api/wishlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await response.json();
      if (!response.ok || !data.wishlist) {
        if (options.notifyErrors !== false) {
          showToast(data.error || 'No se pudo agregar la canción', 'info');
        }
        return false;
      }

      setWishlist(data.wishlist);
      const pendingCount = data.wishlist.filter(entry => entry.status !== 'completed').length;
      if (pendingCount >= MAX_WISHLIST) {
        onAutoStart?.();
        await startDownload();
      }
      return true;
    } catch (error) {
      console.error(error);
      if (options.notifyErrors !== false) {
        showToast('No se pudo actualizar la lista de deseos', 'error');
      }
      return false;
    }
  }, [onAutoStart, showToast, startDownload]);

  return {
    wishlist,
    setWishlist,
    isDownloadActive,
    downloadProgress,
    startDownload,
    completeDownload,
    addWishlistItem,
  };
}
