import { useState, useEffect, useRef } from 'react';
import './index.css';

// Components
import TopHeader from './components/layout/TopHeader';
import Sidebar from './components/layout/Sidebar';
import ConsoleCard from './components/player/ConsoleCard';
import VisualizerCard from './components/player/VisualizerCard';
import LibraryHeader from './components/library/LibraryHeader';
import SongsTable from './components/library/SongsTable';
import SettingsModal from './components/modals/SettingsModal';
import DeleteModal from './components/modals/DeleteModal';
import PlaylistSelectModal from './components/modals/PlaylistSelectModal';
import EditMetadataModal from './components/modals/EditMetadataModal';
import usePartyMode from './hooks/usePartyMode';
import useWishlistDownloads from './hooks/useWishlistDownloads';
import useToast from './hooks/useToast';
import ToastContainer from './components/common/ToastContainer';
import usePlayerController from './hooks/usePlayerController';
import usePartyPlaybackSync from './hooks/usePartyPlaybackSync';
import usePartyQueue from './hooks/usePartyQueue';
import useLibrary from './hooks/useLibrary';

function App() {
  // Global State
  const library = useLibrary();
  const { songList, setSongList, filteredList, currentFolder, searchQuery,
    setSearchQuery, minRating, setMinRating, isLoading, playlists,
    setPlaylists, selectedPlaylist, setSelectedPlaylist,
    changeFolder: handleFolderChange } = library;
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  // Wishlist & Bad Songs State
  const { toasts, showToast, dismissToast } = useToast();
  const partyAvailableNotifierRef = useRef(() => {});
  const {
    wishlist, setWishlist, isDownloadActive, downloadProgress,
    startDownload,
  } = useWishlistDownloads({
    setSongList,
    showToast,
    onCompleted: (requests) => partyAvailableNotifierRef.current(requests),
  });
  const [badSongs, setBadSongs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('badSongs')) || []; }
    catch { return []; }
  });

  // Modals State
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deleteTargetSong, setDeleteTargetSong] = useState(null);
  const [playlistTargetSong, setPlaylistTargetSong] = useState(null);
  const [editTargetSong, setEditTargetSong] = useState(null);

  // Column Visibility State — strictly loaded & saved to localStorage
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('visibleColumns'));
      if (saved) return saved;
    } catch {}
    return { track: true, title: true, artist: true, album: true, genre: true, duration: true, rating: true, location: false };
  });

  useEffect(() => { localStorage.setItem('badSongs', JSON.stringify(badSongs)); }, [badSongs]);
  useEffect(() => { localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns)); }, [visibleColumns]);
  
  // Party Mode State
  async function handlePartyWishlistRequest(request) {
    const title = String(request?.title || '').trim();
    const artist = String(request?.artist || '').trim();
    if (!title) return;
    try {
      const response = await fetch('/api/wishlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          artist,
          query: artist ? `${artist} - ${title}` : title,
          source: 'party_guest',
          requestedBy: request.requested_by_name || 'invitado',
          partyRequestId: request.id || '',
        }),
      });
      const data = await response.json();
      if (data.wishlist) setWishlist(data.wishlist);
      if (!response.ok) {
        showToast(data.error || 'No se pudo agregar la solicitud del invitado', 'error');
        return;
      }
      showToast(`Solicitud de ${request.requested_by_name || 'un invitado'} agregada a deseos`, 'success');
      const pendingCount = data.wishlist.filter(item => ['pending', 'error'].includes(item.status)).length;
      if (pendingCount >= 5 && !isDownloadActive) {
        showToast('La lista alcanzó 5 canciones: iniciando descarga automática', 'info');
        startDownload();
      }
    } catch (error) {
      console.error('No se pudo recibir la solicitud de descarga del invitado', error);
    }
  }

  const party = usePartyMode(showToast, songList, handlePartyWishlistRequest, setSongList);
  const { enabled: partyModeEnabled, limit: partyLimit, queue: partyQueue,
    room: partyRoom, connected: partyConnected, busy: partyBusy,
    connectionError: partyConnectionError,
    catalogSyncing: partyCatalogSyncing, cyclicRequests: partyCyclicRequests,
    isPublic: partyPublic,
    setEnabled: setPartyModeEnabled, setLimit: setPartyLimit,
    setCyclicRequests: setPartyCyclicRequests, setPartyPublic: onPartyPublicChange,
    updatePlayback, dequeue: dequeuePartySong, enqueue: enqueuePartySong,
    removeQueueItem, reorderQueue, setParticipantBlocked,
    notifyWishlistAvailable } = party;
  useEffect(() => {
    partyAvailableNotifierRef.current = notifyWishlistAvailable;
  }, [notifyWishlistAvailable]);

  
  const player = usePlayerController({
    songList, filteredList, partyModeEnabled, dequeuePartySong,
  });
  const {
    audioRef, currentSong, setCurrentSong, isPlaying, setIsPlaying,
    isShuffle, setIsShuffle, isRepeat, setIsRepeat, currentTime,
    setCurrentTime, duration, volume, setVolume, playSongDirectly,
    advancePartyQueue, playNext, playPrev, togglePlay,
  } = player;
  usePartyPlaybackSync({
    enabled: partyModeEnabled, currentSong, currentTime, duration,
    isPlaying, updatePlayback,
  });
  const { playItem: handlePartyPlayItem, playLibrarySong: handleLibraryPlay } = usePartyQueue({
    enabled: partyModeEnabled, queue: partyQueue, currentSong, isPlaying,
    advance: advancePartyQueue, enqueue: enqueuePartySong, playDirectly: playSongDirectly,
  });
  
  useEffect(() => {
    if (theme === "light") document.body.classList.add("light-theme");
    else document.body.classList.remove("light-theme");
  }, [theme]);


  // Rate Song Handler
  const handleRateSong = (song, newRating) => {
    fetch('/api/rate_song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: song.path, rating: newRating })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSongList(prev => prev.map(s => s.path === song.path ? { ...s, rating: newRating } : s));
        }
      })
      .catch(console.error);
  };

  // Delete Song Confirm Handler
  const handleDeleteConfirm = (song) => {
    fetch('/api/delete_song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: song.path })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSongList(prev => prev.filter(s => s.path !== song.path));
          if (currentSong?.path === song.path) {
            setIsPlaying(false);
            setCurrentSong(null);
          }
          setDeleteTargetSong(null);
        }
      })
      .catch(console.error);
  };

  // Mark Song as Bad/Discarded Handler
  const handleMarkBad = (song) => {
    const entry = `${song.artist} - ${song.title} (${song.path})`;
    if (!badSongs.includes(entry)) setBadSongs(prev => [...prev, entry]);
    setSongList(prev => prev.filter(s => s.path !== song.path));
    if (currentSong?.path === song.path) {
      setIsPlaying(false);
      setCurrentSong(null);
    }
    setDeleteTargetSong(null);
  };

  // Playlist Handlers
  const handleCreatePlaylist = (name, callback) => {
    fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.playlists) {
          setPlaylists(data.playlists);
          callback?.();
        }
      })
      .catch(console.error);
  };

  const handleDeletePlaylist = (name) => {
    fetch('/api/playlists', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.playlists) {
          setPlaylists(data.playlists);
          if (selectedPlaylist === name) setSelectedPlaylist(null);
        }
      })
      .catch(console.error);
  };

  const handleAddToPlaylist = (playlistName, song) => {
    fetch('/api/playlists/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlist_name: playlistName, song_path: song.path })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.playlists) {
          setPlaylists(data.playlists);
        }
      })
      .catch(console.error);
  };

  const handleSaveMetadata = (updatedMetadata) => {
    setSongList(prev => prev.map(s => s.path === updatedMetadata.path ? { ...s, ...updatedMetadata } : s));
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="app-container">
        <TopHeader
          theme={theme}
          setTheme={setTheme}
          wishlistCount={wishlist.length}
          isPlaying={isPlaying}
          currentFolder={currentFolder}
          onOpenWishlist={() => setIsWishlistOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isWishlistOpen={isWishlistOpen}
          setIsWishlistOpen={setIsWishlistOpen}
          wishlist={wishlist}
          setWishlist={setWishlist}
          isDownloadActive={isDownloadActive}
          downloadProgress={downloadProgress}
          onStartDownload={startDownload}
        />

        
        <div className="top-grid">
          <ConsoleCard 
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlayToggle={togglePlay}
            isShuffle={isShuffle}
            onShuffleToggle={() => setIsShuffle(!isShuffle)}
            isRepeat={isRepeat}
            onRepeatToggle={() => setIsRepeat(!isRepeat)}
            onNext={playNext}
            onPrev={playPrev}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            onSeek={(val) => {
              if (audioRef.current) audioRef.current.currentTime = val;
              setCurrentTime(val);
            }}
            onVolumeChange={(val) => {
              setVolume(val);
              if (audioRef.current) audioRef.current.volume = val;
            }}
          />
          <VisualizerCard isPlaying={isPlaying} currentSong={currentSong} />
        </div>

        <div className="library-container">
          <Sidebar 
            partyModeEnabled={partyModeEnabled}
            onPartyEnabledChange={setPartyModeEnabled}
            partyLimit={partyLimit}
            onPartyLimitChange={setPartyLimit}
            partyRoom={partyRoom}
            partyConnected={partyConnected}
            partyConnectionError={partyConnectionError}
            partyBusy={partyBusy}
            partyCatalogSyncing={partyCatalogSyncing}
            partyCyclicRequests={partyCyclicRequests}
            onPartyCyclicRequestsChange={setPartyCyclicRequests}
            partyPublic={partyPublic}
            onPartyPublicChange={onPartyPublicChange}
            partyQueue={partyQueue}

            partyCurrentSong={currentSong}
            onPartyPlayItem={handlePartyPlayItem}
            onPartyRemoveItem={removeQueueItem}
            onPartyReorderItem={reorderQueue}
            onPartyParticipantBlockedChange={setParticipantBlocked}
            playlists={playlists}
            selectedPlaylist={selectedPlaylist}
            onPlaylistSelect={(name) => setSelectedPlaylist(name)}
            onCreatePlaylist={handleCreatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
          />
          
          <div className="library-section">
            <LibraryHeader 
              onSearchChange={(q) => setSearchQuery(q)}
              rating={minRating}
              onRatingChange={(r) => setMinRating(r)}
              visibleColumns={visibleColumns}
              setVisibleColumns={setVisibleColumns}
              filteredCount={filteredList.length}
              totalCount={selectedPlaylist ? (playlists[selectedPlaylist]?.length || 0) : songList.length}
              onBulkEdit={() => {}}
              onClearSearch={() => setSearchQuery('')}
            />
            <SongsTable 
              songs={filteredList} 
              currentSong={currentSong}
              isPlaying={isPlaying}
              isLoading={isLoading}
              searchQuery={searchQuery}
              visibleColumns={visibleColumns}
              onPlay={(idx) => { handleLibraryPlay(filteredList[idx]); }}
              onAddToWishlist={(q) => { if (!wishlist.includes(q)) setWishlist([...wishlist, q]); }}
              onEdit={(idx) => { setEditTargetSong(filteredList[idx]); }}
              onAddToPlaylist={(idx) => { setPlaylistTargetSong(filteredList[idx]); }}
              onRateSong={handleRateSong}
              onDeleteSong={(song) => setDeleteTargetSong(song)}
            />
          </div>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentFolder={currentFolder}
        onFolderChange={handleFolderChange}
        badSongs={badSongs}
        setBadSongs={setBadSongs}
        partyServerUrl={party.serverUrl}
        onPartyServerUrlChange={party.setServerUrl}
      />

      <DeleteModal
        isOpen={!!deleteTargetSong}
        onClose={() => setDeleteTargetSong(null)}
        song={deleteTargetSong}
        onDeleteConfirm={handleDeleteConfirm}
        onMarkBad={handleMarkBad}
      />

      <PlaylistSelectModal
        isOpen={!!playlistTargetSong}
        onClose={() => setPlaylistTargetSong(null)}
        song={playlistTargetSong}
        playlists={playlists}
        onAddToPlaylist={handleAddToPlaylist}
        onCreatePlaylist={handleCreatePlaylist}
      />

      <EditMetadataModal
        isOpen={!!editTargetSong}
        onClose={() => setEditTargetSong(null)}
        song={editTargetSong}
        onSaveMetadata={handleSaveMetadata}
      />
      
      <audio ref={audioRef} id="audio-player" preload="auto" crossOrigin="anonymous"></audio>
    </>
  );
}

export default App;
