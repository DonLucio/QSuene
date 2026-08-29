import React, { useState, useEffect, useRef } from 'react';
import LogoLoader from '../common/LogoLoader';

function SongsTable({ 
  songs, currentSong, isPlaying, isLoading, searchQuery, visibleColumns = {}, 
  selectedPlaylist, onPlay, onEdit, onAddToPlaylist, onRateSong, onDeleteSong, onRemoveFromPlaylist 
}) {

  const [pagination, setPagination] = useState({ page: 1, songs });
  const currentPage = pagination.songs === songs ? pagination.page : 1;
  const setCurrentPage = (updater) => setPagination((previous) => ({
    page: typeof updater === 'function' ? updater(previous.songs === songs ? previous.page : 1) : updater,
    songs,
  }));
  const [rowMenuIndex, setRowMenuIndex] = useState(null);
  const rowMenuRef = useRef(null);
  const itemsPerPage = 100;

  // Resizable column widths, persisted to localStorage
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('colWidths')) || { title: 240, artist: 180, album: 160 }; }
    catch { return { title: 240, artist: 180, album: 160 }; }
  });
  useEffect(() => { localStorage.setItem('colWidths', JSON.stringify(colWidths)); }, [colWidths]);

  const totalPages = Math.max(1, Math.ceil(songs.length / itemsPerPage));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSongs = songs.slice(startIndex, endIndex);

  const formatTime = (secs) => {
    if (isNaN(secs) || !secs) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Close row context menu on outside click
  const handleTableClick = (e) => {
    if (rowMenuRef.current && !rowMenuRef.current.contains(e.target)) {
      setRowMenuIndex(null);
    }
  };

  // Column resize handler
  const startResize = (col, minW, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col];
    const onMove = (mv) => {
      const newW = Math.max(minW, startW + mv.clientX - startX);
      setColWidths(prev => ({ ...prev, [col]: newW }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // --- EMPTY STATES ---
  const renderEmpty = () => {
    if (searchQuery) {
      return (
        <tr>
          <td colSpan="10" className="table-empty-state">
            <i className="fa-solid fa-magnifying-glass" style={{ opacity: 0.5 }}></i>
            <p style={{ margin: '0.5rem 0' }}>No encontramos canciones para <strong>"{searchQuery}"</strong></p>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Prueba con otro título, artista o álbum.</span>
          </td>
        </tr>
      );
    }
    return (
      <tr>
        <td colSpan="10" className="table-empty-state">
          <i className="fa-solid fa-compact-disc"></i>
          <p>{selectedPlaylist ? `La lista "${selectedPlaylist}" está vacía` : 'Tu biblioteca está vacía'}</p>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {selectedPlaylist ? 'Arrastra canciones aquí o usa el menú ⋮ para agregar' : 'Selecciona una carpeta de música para comenzar'}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="table-wrapper" onClick={handleTableClick}>
      {/* Scrollable table area */}
      <div className="table-scroll-area">
        <table className="songs-table">
          <thead>
            <tr>
              <th className="col-track" style={{ width: '44px' }}>#</th>
              {visibleColumns.title !== false && (
                <th className="col-title col-resizable" style={{ width: colWidths.title }}>
                  Título
                  <div className="resize-handle" onMouseDown={(e) => startResize('title', 180, e)} />
                </th>
              )}
              {visibleColumns.artist !== false && (
                <th className="col-artist col-resizable" style={{ width: colWidths.artist }}>
                  Artista
                  <div className="resize-handle" onMouseDown={(e) => startResize('artist', 160, e)} />
                </th>
              )}
              {visibleColumns.album !== false && (
                <th className="col-album col-resizable" style={{ width: colWidths.album }}>
                  Álbum
                  <div className="resize-handle" onMouseDown={(e) => startResize('album', 150, e)} />
                </th>
              )}
              {visibleColumns.genre !== false && <th className="col-genre">Género</th>}
              {visibleColumns.rating !== false && <th className="col-rating" style={{ width: '100px' }}>Calificación</th>}
              <th className="col-quality">Calidad</th>
              {visibleColumns.duration !== false && <th className="col-duration">Duración</th>}
              {visibleColumns.location === true && <th className="col-location">Archivo</th>}
              <th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '4.5rem 1rem' }}>
                  <LogoLoader 
                    text={selectedPlaylist ? `Cargando lista "${selectedPlaylist}"...` : "Cargando biblioteca..."} 
                    size={72} 
                  />
                </td>
              </tr>
            ) : currentSongs.length === 0 ? renderEmpty() : (

              currentSongs.map((song, i) => {
                const actualIndex = startIndex + i;
                const isActive = currentSong && currentSong.path === song.path;
                const positionNum = startIndex + i + 1; // 1-based position in result
                const isNearBottom = i >= currentSongs.length - 3 && currentSongs.length > 4;

                return (
                  <tr
                    key={actualIndex}
                    className={`${isActive ? 'active' : ''} ${rowMenuIndex === actualIndex ? 'menu-open' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', song.path);
                      e.dataTransfer.setData('application/json', JSON.stringify(song));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={() => onPlay(actualIndex)}
                  >
                    {/* Nº column: position number, or ♪ when this song is playing */}
                    <td className="col-track">
                      {isActive && isPlaying ? (
                        <span className="now-playing-indicator" title="Reproduciendo">♪</span>
                      ) : (
                        <span className="row-position">{positionNum}</span>
                      )}
                      {/* Play button appears on hover via CSS */}
                      <button
                        className="btn-play-hover"
                        onClick={(e) => { e.stopPropagation(); onPlay(actualIndex); }}
                        title="Reproducir"
                      >
                        <i className="fa-solid fa-play"></i>
                      </button>
                    </td>

                    {visibleColumns.title !== false && (
                      <td className="col-title row-title" title={song.title}>
                        {song.title ? song.title.replace(/^\d{1,3}\s*[._-]\s*/, '') : '—'}
                      </td>
                    )}
                    {visibleColumns.artist !== false && (
                      <td className="col-artist" title={song.artist}>{song.artist}</td>
                    )}
                    {visibleColumns.album !== false && (
                      <td className="col-album" title={song.album}>{song.album || '—'}</td>
                    )}
                    {visibleColumns.genre !== false && (
                      <td className="col-genre" title={song.genre}>{song.genre || '—'}</td>
                    )}
                    {visibleColumns.rating !== false && (
                      <td className="col-rating" onClick={(e) => e.stopPropagation()}>
                        <div className="star-rating">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span
                              key={star}
                              onClick={() => onRateSong && onRateSong(song, star === song.rating ? 0 : star)}
                              style={{ cursor: 'pointer', color: star <= (song.rating || 0) ? '#f97316' : 'rgba(255,255,255,0.18)', fontSize: '0.85rem' }}
                              title={`Calificar ${star} estrella${star > 1 ? 's' : ''}`}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="col-quality">{song.bitrate} kbps</td>
                    {visibleColumns.duration !== false && (
                      <td className="col-duration">{formatTime(song.duration)}</td>
                    )}
                    {visibleColumns.location === true && (
                      <td className="col-location" title={song.path} style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {song.path ? (song.path.split('\\').pop() || song.path.split('/').pop()) : '—'}
                      </td>
                    )}

                    {/* Actions: ⋮ menu */}
                    <td className="col-actions">
                      <div className="row-actions-group">
                        <button
                          className="btn-row-menu"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRowMenuIndex(rowMenuIndex === actualIndex ? null : actualIndex);
                          }}
                          title="Más opciones"
                        >
                          <i className="fa-solid fa-ellipsis"></i>
                        </button>

                        {rowMenuIndex === actualIndex && (
                          <div ref={rowMenuRef} className={`row-context-menu ${isNearBottom ? 'open-up' : ''}`}>
                            <button onClick={(e) => { e.stopPropagation(); onPlay(actualIndex); setRowMenuIndex(null); }}>
                              <i className="fa-solid fa-play"></i> Reproducir
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onAddToPlaylist(actualIndex); setRowMenuIndex(null); }}>
                              <i className="fa-solid fa-list-check"></i> Agregar a lista...
                            </button>
                            {selectedPlaylist && onRemoveFromPlaylist && (
                              <button onClick={(e) => { e.stopPropagation(); onRemoveFromPlaylist(song); setRowMenuIndex(null); }} style={{ color: '#f59e0b' }}>
                                <i className="fa-solid fa-folder-minus"></i> Quitar de "{selectedPlaylist}"
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); onEdit(actualIndex); setRowMenuIndex(null); }}>
                              <i className="fa-solid fa-pen-to-square"></i> Editar información
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); if (onDeleteSong) onDeleteSong(song); setRowMenuIndex(null); }} style={{ color: '#f87171' }}>
                              <i className="fa-solid fa-trash-can"></i> Eliminar canción
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Compact pagination footer */}
      {!isLoading && songs.length > 0 && (
        <div className="table-pagination">
          <span className="pagination-info">
            {(effectivePage - 1) * itemsPerPage + 1}–{Math.min(effectivePage * itemsPerPage, songs.length)} de {songs.length.toLocaleString()} canciones
          </span>
          <div className="pagination-nav">
            <button
              className="btn-page"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={effectivePage === 1}
              title="Página anterior"
            >
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span className="pagination-current">{effectivePage} / {totalPages}</span>
            <button
              className="btn-page"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={effectivePage === totalPages}
              title="Página siguiente"
            >
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SongsTable;
