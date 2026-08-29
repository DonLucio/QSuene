import React, { useState } from 'react';
import ModalShell from './ModalShell';

const formDataFromSong = (song) => ({
  title: song?.title || '',
  artist: song?.artist || '',
  album: song?.album || '',
  genre: song?.genre || '',
  year: song?.year || '',
  track: song?.track || ''
});

function EditMetadataModal({ isOpen, onClose, song, onSaveMetadata }) {
  const [formData, setFormData] = useState(() => formDataFromSong(song));
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !song) return null;

  const handleChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSaving(true);
    fetch('/api/save_metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: song.path, ...formData })
    })
      .then(res => res.json())
      .then(data => {
        setIsSaving(false);
        if (data.success && data.metadata) {
          onSaveMetadata(data.metadata);
          onClose();
        }
      })
      .catch(err => {
        console.error(err);
        setIsSaving(false);
      });
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={isSaving ? undefined : onClose}
      ariaLabelledBy="metadata-modal-title"
      panelStyle={{ width: '460px', maxWidth: '92%' }}
    >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <h3 id="metadata-modal-title" style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="fa-solid fa-pen-to-square" style={{ color: 'var(--primary)' }}></i> Editar Información ID3
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>


        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Título</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Artista</label>
              <input
                type="text"
                value={formData.artist}
                onChange={(e) => handleChange('artist', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Álbum</label>
              <input
                type="text"
                value={formData.album}
                onChange={(e) => handleChange('album', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Género</label>
              <input
                type="text"
                value={formData.genre}
                onChange={(e) => handleChange('genre', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Año</label>
              <input
                type="text"
                value={formData.year}
                onChange={(e) => handleChange('year', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Pista (Nº)</label>
              <input
                type="text"
                value={formData.track}
                onChange={(e) => handleChange('track', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ fontSize: '0.85rem' }}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={isSaving} style={{ fontSize: '0.85rem' }}>
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
    </ModalShell>
  );
}

const inputStyle = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-main)',
  borderRadius: '8px',
  padding: '0.45rem 0.75rem',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box'
};

export default EditMetadataModal;
