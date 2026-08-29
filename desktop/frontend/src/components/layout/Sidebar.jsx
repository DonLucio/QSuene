import { useEffect, useState } from 'react';
import ConfirmModal from '../modals/ConfirmModal';
import PartyPanel from '../party/PartyPanel';

export default function Sidebar(props) {
  const { partyModeEnabled, onPartyEnabledChange, partyLimit, onPartyLimitChange,
    partyCyclicRequests = false, onPartyCyclicRequestsChange = () => {}, partyPublic = false,
    onPartyPublicChange = () => {}, partyQueue = [], partyRoom, partyConnected = false,
    partyConnectionError = '', partyBusy = false, partyCatalogSyncing = false,
    onPartyPlayItem = () => {}, onPartyRemoveItem = () => {}, onPartyParticipantBlockedChange = () => {},
    onPartyReorderItem = () => {}, playlists = {}, selectedPlaylist, onPlaylistSelect = () => {},
    onCreatePlaylist = () => {}, onDeletePlaylist = () => {}, onRenamePlaylist = () => {},
    onAddToPlaylist = () => {} } = props;
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragOver, setDragOver] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => localStorage.setItem('sidebarCollapsed', collapsed), [collapsed]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const key = event => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close); window.addEventListener('contextmenu', close); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); window.removeEventListener('keydown', key); };
  }, [menu]);

  const submitNew = event => { event.preventDefault(); const name = newName.trim(); if (!name) return; onCreatePlaylist(name); setNewName(''); setShowNew(false); };
  const submitRename = event => { event?.preventDefault(); if (!editing) return; const name = editing.value.trim(); if (name && name !== editing.name) onRenamePlaylist(editing.name, name); setEditing(null); };
  const dropOn = (event, name) => { event.preventDefault(); setDragOver(null); const path = event.dataTransfer.getData('text/plain'); if (path) onAddToPlaylist(name, { path }); };

  return <div className={`playlists-sidebar ${collapsed ? 'collapsed' : ''}`}>
    <button className="sidebar-toggle-btn" onClick={() => setCollapsed(value => !value)} title={collapsed ? 'Expandir panel' : 'Colapsar panel'}><i className={`fa-solid fa-chevron-${collapsed ? 'right' : 'left'}`}></i></button>
    {!collapsed && <>
      <PartyPanel enabled={partyModeEnabled} onEnabledChange={onPartyEnabledChange} limit={partyLimit} onLimitChange={onPartyLimitChange}
        cyclicRequests={partyCyclicRequests} onCyclicChange={onPartyCyclicRequestsChange} isPublic={partyPublic} onPublicChange={onPartyPublicChange}
        queue={partyQueue} room={partyRoom} connected={partyConnected} connectionError={partyConnectionError} busy={partyBusy}
        catalogSyncing={partyCatalogSyncing} onPlayItem={onPartyPlayItem} onRemoveItem={onPartyRemoveItem}
        onBlockParticipant={onPartyParticipantBlockedChange} onReorderItem={onPartyReorderItem} />
      <div className="sidebar-header" style={{ marginTop: '0.2rem' }}><span><i className="fa-solid fa-list-ul"></i> Listas</span>
        <button className="btn-add-playlist" onClick={() => setShowNew(value => !value)} title="Crear lista"><i className="fa-solid fa-circle-plus"></i></button></div>
      {showNew && <form onSubmit={submitNew} style={{ margin: '0.4rem 0 0.8rem', display: 'flex', gap: '0.3rem' }}>
        <input type="text" placeholder="Nombre lista..." value={newName} onChange={event => setNewName(event.target.value)} autoFocus style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '6px', padding: '0.3rem 0.5rem' }} />
        <button type="submit" className="btn">+</button></form>}
      <div className="playlists-list">
        <div className={`playlist-item ${selectedPlaylist == null ? 'active' : ''}`} onClick={() => onPlaylistSelect(null)}><span className="playlist-item-label"><span className="playlist-item-icon"><i className="fa-solid fa-music"></i></span><span className="playlist-item-name">Toda la música</span></span></div>
        {Object.keys(playlists).map(name => <div key={name} className={`playlist-item ${selectedPlaylist === name ? 'active' : ''} ${dragOver === name ? 'drag-over' : ''}`}
          onClick={() => editing?.name !== name && onPlaylistSelect(name)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ name, x: event.clientX, y: event.clientY }); }}
          onDragOver={event => { event.preventDefault(); setDragOver(name); }} onDragLeave={() => setDragOver(null)} onDrop={event => dropOn(event, name)}>
          {editing?.name === name ? <form onSubmit={submitRename} onClick={event => event.stopPropagation()} style={{ width: '100%' }}><input value={editing.value}
            onChange={event => setEditing({ ...editing, value: event.target.value })} onBlur={submitRename} onKeyDown={event => { if (event.key === 'Escape') setEditing(null); }} autoFocus /></form>
            : <><span className="playlist-item-label"><span className="playlist-item-icon"><i className="fa-solid fa-list-ul"></i></span><span className="playlist-item-name">{name}</span></span><button type="button" className="playlist-inline-delete" onClick={event => { event.stopPropagation(); setToDelete(name); }} title={`Eliminar ${name}`} aria-label={`Eliminar lista ${name}`}><i className="fa-solid fa-xmark"></i></button></>}
        </div>)}
      </div>
    </>}
    {collapsed && <div className="sidebar-collapsed-icons">
      <button className={`sidebar-icon-btn ${partyModeEnabled ? 'active' : ''}`} onClick={() => onPartyEnabledChange(!partyModeEnabled)} title="Modo fiesta"><i className="fa-solid fa-champagne-glasses"></i></button>
      <button className={`sidebar-icon-btn ${selectedPlaylist == null ? 'active' : ''}`} onClick={() => onPlaylistSelect(null)} title="Toda la música"><i className="fa-solid fa-music"></i></button>
      {Object.keys(playlists).map(name => <button key={name} className={`sidebar-icon-btn ${selectedPlaylist === name ? 'active' : ''}`} onClick={() => onPlaylistSelect(name)} title={name}><i className="fa-solid fa-list-ul"></i></button>)}
    </div>}
    {menu && <div className="context-menu" style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 100), zIndex: 99999 }} onClick={event => event.stopPropagation()}>
      <div className="context-menu-item" onClick={() => { setEditing({ name: menu.name, value: menu.name }); setMenu(null); }}><i className="fa-solid fa-pen-to-square"></i><span>Cambiar nombre</span></div>
      <div className="context-menu-item" style={{ color: '#f87171' }} onClick={() => { setToDelete(menu.name); setMenu(null); }}><i className="fa-solid fa-trash-can"></i><span>Eliminar lista</span></div>
    </div>}
    <ConfirmModal isOpen={!!toDelete} title="Eliminar Lista de Reproducción" message={`¿Deseas eliminar la lista “${toDelete}”? Las canciones seguirán en tu biblioteca.`}
      confirmText="Eliminar lista" cancelText="Cancelar" isDanger onConfirm={() => { onDeletePlaylist(toDelete); setToDelete(null); }} onCancel={() => setToDelete(null)} />
  </div>;
}
