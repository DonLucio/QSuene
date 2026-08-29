import React, { useState } from 'react';
import ModalShell from './ModalShell';

function PlaylistSelectModal({ isOpen, onClose, song, playlists, onAddToPlaylist, onCreatePlaylist }) {
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  if (!isOpen || !song) return null;

  const playlistNames = Object.keys(playlists || {});

  const handleSelect = (name) => {
    onAddToPlaylist(name, song);
    onClose();
  };

  const handleCreateAndAdd = (e) => {
    e.preventDefault();
    const name = newPlaylistName.trim();
    if (!name) return;
    onCreatePlaylist(name, () => {
      onAddToPlaylist(name, song);
      setNewPlaylistName('');
      setShowNewInput(false);
      onClose();
    });
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="playlist-select-modal-title"
      panelStyle={{ width: '420px', maxWidth: '92%' }}
    >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 id="playlist-select-modal-title" style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="fa-solid fa-list-check" style={{ color: 'var(--primary)' }}></i> Agregar a Lista
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>


        {/* Target Song Info */}
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.6rem 0.8rem', borderRadius: '8px', marginBottom: '1.2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {song.title}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            {song.artist}
          </div>
        </div>

        {/* Existing Playlists */}
        <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {playlistNames.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: '1rem 0' }}>
              No tienes listas creadas aún.
            </p>
          ) : (
            playlistNames.map(name => {
              const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
              const inList = (playlists[name] || []).some(p => normalizePath(p) === normalizePath(song.path));
              return (
                <button
                  key={name}
                  onClick={() => !inList && handleSelect(name)}
                  disabled={inList}
                  className="playlist-select-item"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '0.65rem 0.9rem',
                    background: inList ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)', borderRadius: '8px',
                    color: inList ? 'var(--text-muted)' : 'var(--text-main)',
                    fontSize: '0.88rem', cursor: inList ? 'not-allowed' : 'pointer',
                    textAlign: 'left', transition: 'all 0.15s ease',
                    opacity: inList ? 0.75 : 1
                  }}
                  title={inList ? 'Esta canción ya está en la lista' : `Agregar a "${name}"`}
                >
                  <span><i className="fa-solid fa-list-ul" style={{ color: inList ? 'var(--text-muted)' : 'var(--primary)', marginRight: '0.6rem' }}></i> {name}</span>
                  {inList ? (
                    <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 600 }}>
                      <i className="fa-solid fa-check" style={{ marginRight: '4px' }}></i> Ya en la lista
                    </span>
                  ) : (
                    <i className="fa-solid fa-plus" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}></i>
                  )}
                </button>
              );
            })

          )}
        </div>

        {/* Create new playlist toggle */}
        {!showNewInput ? (
          <button
            className="btn btn-secondary"
            onClick={() => setShowNewInput(true)}
            style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem' }}
          >
            <i className="fa-solid fa-circle-plus"></i> Crear nueva lista
          </button>
        ) : (
          <form onSubmit={handleCreateAndAdd} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Nombre de la lista..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              autoFocus
              style={{
                flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                color: 'var(--text-main)', borderRadius: '8px', padding: '0.5rem 0.8rem',
                fontSize: '0.85rem', fontFamily: 'inherit'
              }}
            />
            <button type="submit" className="btn" style={{ padding: '0.5rem 0.9rem', fontSize: '0.82rem' }}>
              Crear
            </button>
          </form>
        )}
    </ModalShell>
  );
}

export default PlaylistSelectModal;
