import { useState } from 'react';
import PartyQrModal from '../modals/PartyQrModal';

export default function PartyPanel({ enabled, onEnabledChange, limit, onLimitChange,
  cyclicRequests, onCyclicChange, isPublic, onPublicChange, queue, room, connected,
  connectionError, busy, catalogSyncing, onPlayItem, onRemoveItem, onBlockParticipant,
  onReorderItem }) {
  const [showQr, setShowQr] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const guests = room?.participants?.filter(item => item.role === 'guest') || [];

  return <>
    <div className="sidebar-header" style={{ marginBottom: '0.2rem' }}>
      <span><i className="fa-solid fa-champagne-glasses"></i> Modo fiesta</span>
      <label className="switch" title="Activar o desactivar Modo Fiesta">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => {
          if (!event.target.checked) setShowQr(false);
          onEnabledChange(event.target.checked);
        }} />
        <span className="slider round"></span>
      </label>
    </div>

    {enabled && <div id="party-mode-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
      <span style={{ color: connectionError ? '#fb7185' : (connected ? '#62d99b' : '#f0ad68'), fontSize: '0.72rem' }} title={connectionError || undefined}>
        <i className={`fa-solid ${connectionError ? 'fa-triangle-exclamation' : (connected ? 'fa-circle' : 'fa-circle-notch fa-spin')}`}></i>{' '}
        {busy ? 'Preparando fiesta…' : (catalogSyncing ? 'Actualizando biblioteca…' : (connectionError ? 'Error de conexión' : (connected ? 'Conectado' : 'Reconectando')))}
      </span>

      {room?.join_url && <div className="party-access-actions">
        <button type="button" className="btn" onClick={() => setShowQr(true)}><i className="fa-solid fa-qrcode"></i> Mostrar QR</button>
      </div>}

      <div className="party-limit-row">
        <span title="Límite de canciones">Límite:</span>
        <div className="party-limit-controls">
          <input type="number" value={limit} disabled={!connected} onChange={(event) => onLimitChange(parseInt(event.target.value) || 0)} min="1" max="20" title="Cantidad máxima por invitado" />
          <button type="button" className={`party-cycle-toggle ${cyclicRequests ? 'active' : ''}`} aria-pressed={cyclicRequests} disabled={!connected} onClick={() => onCyclicChange(!cyclicRequests)} title={cyclicRequests ? 'Cíclico: libera un cupo al comenzar una canción' : 'Una ocasión: el cupo no se renueva'}>
            <i className="fa-solid fa-arrows-rotate"></i>
          </button>
        </div>
      </div>

      <div className="party-public-row">
        <span className={isPublic ? 'active' : ''} title="Visible en la página pública, con máximo de 10 invitados"><i className="fa-solid fa-globe"></i> Fiesta pública</span>
        <label className="switch party-public-switch">
          <input type="checkbox" checked={isPublic} disabled={!connected} onChange={(event) => onPublicChange(event.target.checked)} />
          <span className="slider round"></span>
        </label>
      </div>

      <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>En cola · {room?.participants?.filter(item => item.connected).length || 0} conectados</span>
        <span id="party-queue-count" style={{ color: 'var(--accent)' }}>{queue.length}</span>
      </div>
      <div id="party-queue-list" className="party-queue-list party-scrollbar">
        {!queue.length ? <div className="party-queue-empty">Cola vacía</div> : queue.map((song, index) => <div key={song.id || index}
          className={`party-queue-item ${song.source === 'dj' ? 'from-dj' : 'from-guest'} ${draggedItem === song.id ? 'dragging' : ''}`}
          draggable onDragStart={() => setDraggedItem(song.id)} onDragEnd={() => setDraggedItem(null)} onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); if (draggedItem && draggedItem !== song.id) onReorderItem(draggedItem, index); setDraggedItem(null); }}>
          <span className="party-queue-grip" title="Arrastrar para reorganizar"><i className="fa-solid fa-grip-vertical"></i></span>
          <div className="party-queue-copy"><span className="party-queue-title">{index + 1}. {song.title}</span><span className="party-queue-owner">Por: {song.source === 'dj' ? 'DJ' : (song.requested_by_name || 'Invitado')}</span></div>
          <div className="party-queue-actions">
            <button type="button" disabled={index === 0 || !connected} onClick={() => onReorderItem(song.id, index - 1)} title="Subir"><i className="fa-solid fa-chevron-up"></i></button>
            <button type="button" disabled={index === queue.length - 1 || !connected} onClick={() => onReorderItem(song.id, index + 1)} title="Bajar"><i className="fa-solid fa-chevron-down"></i></button>
            <button type="button" className="party-play-now" disabled={!connected} onClick={() => onPlayItem(song)} title="Reproducir ahora"><i className="fa-solid fa-play"></i></button>
            <button type="button" className="party-cancel-item" disabled={!connected} onClick={() => onRemoveItem(song)} title="Retirar"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>)}
      </div>

      <div className="party-users-section">
        <div className="party-users-title"><span><i className="fa-solid fa-users"></i> Usuarios</span><b>{guests.length}</b></div>
        <div className="party-users-list party-scrollbar">
          {guests.map(participant => <div className={`party-user-item ${participant.blocked ? 'blocked' : ''}`} key={participant.id}>
            <span className={`party-user-presence ${participant.connected ? 'online' : ''}`}></span>
            <span className="party-user-name" title={participant.name}>{participant.name}</span>
            <button type="button" disabled={!connected} className={participant.blocked ? 'unblock' : ''} onClick={() => onBlockParticipant(participant, !participant.blocked)} title={participant.blocked ? `Desbloquear a ${participant.name}` : `Bloquear a ${participant.name}`}>
              <i className={`fa-solid ${participant.blocked ? 'fa-lock-open' : 'fa-ban'}`}></i>
            </button>
          </div>)}
          {!guests.length && <div className="party-users-empty">Aún no hay invitados</div>}
        </div>
      </div>
    </div>}
    <PartyQrModal isOpen={showQr} joinUrl={room?.join_url} onClose={() => setShowQr(false)} />
  </>;
}
