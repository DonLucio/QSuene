import React from 'react';
import ModalShell from './ModalShell';

function DeleteModal({ isOpen, onClose, song, onDeleteConfirm, onMarkBad, isDeleting = false }) {
  if (!isOpen || !song) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={isDeleting ? undefined : onClose}
      ariaLabelledBy="delete-song-modal-title"
      panelStyle={{ width: '440px', maxWidth: '92%' }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 id="delete-song-modal-title" style={{ margin: 0, color: '#f87171', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="fa-solid fa-triangle-exclamation"></i> Confirmar Eliminación
          </h3>
          <button 
            type="button"
            onClick={onClose} 
            disabled={isDeleting}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
            title="Cerrar"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <p style={{ color: 'var(--text-main)', fontSize: '0.92rem', margin: '0.8rem 0 0.3rem 0' }}>
          ¿Qué deseas hacer con la canción <strong>"{song.title}"</strong>?
        </p>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '1.5rem' }}>
          {song.artist} — {song.filename || song.path}
        </span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button 
            type="button"
            className="btn" 
            onClick={() => onDeleteConfirm(song)}
            disabled={isDeleting}
            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', border: 'none', justifyContent: 'center' }}
          >
            <i className={`fa-solid ${isDeleting ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}></i>{' '}
            {isDeleting ? 'Eliminando…' : 'Eliminar permanentemente del disco'}
          </button>
          
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={() => onMarkBad(song)}
            disabled={isDeleting}
            style={{ justifyContent: 'center' }}
          >
            <i className="fa-solid fa-flag"></i> Marcar como canción defectuosa
          </button>

          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={isDeleting}
            style={{ justifyContent: 'center', opacity: 0.8 }}
          >
            Cancelar
          </button>
        </div>
    </ModalShell>
  );
}

export default DeleteModal;
