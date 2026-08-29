import React, { useState, useEffect, useRef } from 'react';
import ConfirmModal from '../modals/ConfirmModal';

// 6-state machine with symmetrical and intuitive icons
const STATUS_CONFIG = {
  pending:          { label: 'En cola',       icon: 'fa-regular fa-clock' },
  searching:        { label: 'Buscando...',   icon: 'fa-solid fa-magnifying-glass fa-pulse' },
  downloading:      { label: 'Descargando',    icon: 'fa-solid fa-circle-notch fa-spin' },
  moving_to_library:{ label: 'Guardando...',  icon: 'fa-solid fa-folder-open' },
  completed:        { label: 'Listo',          icon: 'fa-solid fa-circle-check' },
  error:            { label: 'Error',          icon: 'fa-solid fa-circle-exclamation' },
};

const ACTIVE_STATUSES = new Set(['searching', 'downloading', 'moving_to_library']);

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleString('es-MX', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return ''; }
}

function WishlistPopover({ isOpen, onClose, anchorRef, wishlist, setWishlist, isDownloadActive, downloadProgress, onStartDownload }) {
  const popoverRef  = useRef(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);



  // Sync on open
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/wishlist')
      .then(r => r.json())
      .then(data => {
        if (data.wishlist) setWishlist(data.wishlist.filter(item => item.status !== 'completed'));
      })
      .catch(console.error);
  }, [isOpen]); // eslint-disable-line

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Derived counts
  const pendingCount   = wishlist.filter(w => w.status === 'pending' || w.status === 'error').length;
  const activeCount    = wishlist.filter(w => ACTIVE_STATUSES.has(w.status)).length;
  const totalCount     = wishlist.length;
  const doneIndex      = wishlist.filter(w => w.status === 'completed').length;

  const progressLabel = activeCount > 0
    ? `[${doneIndex + activeCount}/${totalCount}]`
    : null;

  const triggerDownload = () => {
    if (isDownloadActive) return;
    onClose();
    onStartDownload?.();
  };


  const handleRemove = (id) => {
    fetch('/api/wishlist/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
      .then(r => r.json())
      .then(data => { if (data.wishlist) setWishlist(data.wishlist); })
      .catch(console.error);
  };

  const handleClear = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    fetch('/api/wishlist/clear', { method: 'POST' })
      .then(() => setWishlist([]))
      .catch(console.error)
      .finally(() => setShowClearConfirm(false));
  };


  return (
    <div ref={popoverRef} className="wishlist-popover" role="dialog" aria-label="Lista de deseos">

      {/* HEADER */}
      <div className="wishlist-popover-header">
        <div className="wishlist-popover-title">
          <i className="fa-solid fa-heart-circle-plus" style={{ color: 'var(--primary)' }} />
          <span>Lista de Deseos</span>
          {wishlist.length > 0 && (
            <span className="wishlist-popover-count">{wishlist.length}/5</span>
          )}
        </div>
        <button className="wishlist-popover-close" onClick={onClose} title="Cerrar">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* BODY */}
      <div className="wishlist-popover-body">
        {wishlist.length === 0 ? (
          <div className="wishlist-empty">
            <i className="fa-regular fa-heart" style={{ fontSize: '2rem', opacity: 0.3 }} />
            <p>Tu lista de deseos está vacía</p>
            <span>Busca una canción — se descargará automáticamente al llegar a 5</span>
          </div>
        ) : (
          <ul className="wishlist-item-list">
            {wishlist.map((item) => {
              const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              return (

                <li key={item.id} className={`wishlist-item wishlist-item--${item.status}`}>
                  <div className="wishlist-item-info">
                    <span className="wishlist-item-title" title={item.query}>
                      {item.title || item.query}
                    </span>
                    {item.artist && (
                      <span className="wishlist-item-artist">{item.artist}</span>
                    )}
                    {item.source === 'party_guest' && (
                      <span className="wishlist-item-requester">
                        <i className="fa-solid fa-champagne-glasses" /> Solicitada por {item.requestedBy || 'invitado'}
                      </span>
                    )}
                    <span className="wishlist-item-date">{formatDate(item.addedAt)}</span>
                  </div>

                  <div className="wishlist-item-right">
                    <span
                      className="wishlist-status-badge"
                      title={item.errorMsg || cfg.label}
                    >
                      <i className={cfg.icon} />
                      <span className="wishlist-status-label">{cfg.label}</span>
                    </span>
                    {ACTIVE_STATUSES.has(item.status) && Number(item.progress) > 0 && (
                      <div className="wishlist-item-progress" title={item.stage || cfg.label}>
                        <span><b>{item.stage || cfg.label}</b><em>{Math.round(item.progress)}%</em></span>
                        <div><i style={{ width: `${Math.max(2, Math.min(100, Number(item.progress)))}%` }}></i></div>
                      </div>
                    )}
                    {!ACTIVE_STATUSES.has(item.status) && item.status !== 'completed' && (
                      <button
                        className="wishlist-item-remove"
                        onClick={() => handleRemove(item.id)}
                        title="Quitar de la lista"
                      >
                        <i className="fa-solid fa-xmark" />
                      </button>
                    )}
                  </div>
                </li>
              );

            })}
          </ul>
        )}
      </div>

      {/* FOOTER */}
      {wishlist.length > 0 && (
        <div className="wishlist-popover-footer">
          <button
            className="btn btn-primary wishlist-download-btn"
            onClick={triggerDownload}
            disabled={isDownloadActive || pendingCount === 0}
            title={
              isDownloadActive ? 'Descarga en curso...'
              : pendingCount === 0 ? 'No hay canciones pendientes'
              : `Descargar ${pendingCount} canción${pendingCount !== 1 ? 'es' : ''} manualmente`
            }
          >
            {isDownloadActive ? (
              <>
                <i className="fa-solid fa-arrow-down fa-bounce" />
                <span className="wishlist-progress-label">{downloadProgress || progressLabel || '…'}</span>
                Procesando...
              </>
            ) : (
              <>
                <i className="fa-solid fa-cloud-arrow-down" />
                Descargar Lista
                {pendingCount > 0 && <span className="wishlist-dl-count">{pendingCount}</span>}
              </>
            )}
          </button>

          <button
            className="wishlist-clear-btn"
            onClick={handleClear}
            disabled={isDownloadActive}
            title="Vaciar lista de deseos"
          >
            <i className="fa-solid fa-trash-can" />
          </button>
        </div>
      )}

      {/* Confirm clear modal */}

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Vaciar Lista de Deseos"
        message="¿Estás seguro de que deseas eliminar todas las canciones de tu lista de deseos?"
        confirmText="Vaciar lista"
        cancelText="Cancelar"
        isDanger={true}
        onConfirm={handleConfirmClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

export default WishlistPopover;
