import React from 'react';
import ModalShell from './ModalShell';

function ConfirmModal({ isOpen, title = '¿Estás seguro?', message, confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = true, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      ariaLabelledBy="confirm-modal-title"
      panelStyle={{ width: '420px', maxWidth: '92%' }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 id="confirm-modal-title" style={{ margin: 0, color: isDanger ? '#f87171' : 'var(--text-main)', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className={isDanger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question'}></i> {title}
          </h3>
          <button 
            type="button"
            onClick={onCancel} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
            title="Cerrar"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1.5rem 0', lineHeight: 1.45 }}>
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={onCancel}
            style={{ fontSize: '0.85rem' }}
          >
            {cancelText}
          </button>
          <button 
            type="button" 
            className="btn" 
            onClick={onConfirm}
            style={{
              background: isDanger ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'var(--primary)',
              border: 'none', fontSize: '0.85rem'
            }}
          >
            {confirmText}
          </button>
        </div>
    </ModalShell>
  );
}

export default ConfirmModal;
