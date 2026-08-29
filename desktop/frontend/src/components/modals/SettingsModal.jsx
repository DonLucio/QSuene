import React, { useState } from 'react';
import ModalShell from './ModalShell';

function SettingsModal({ isOpen, onClose, currentFolder, onFolderChange, badSongs = [], setBadSongs, partyServerUrl = '', onPartyServerUrlChange = () => {} }) {
  const [serverDraft, setServerDraft] = useState(null);

  const savePartyServer = async (event) => {
    event.preventDefault();
    const value = serverDraft ?? partyServerUrl;
    const saved = await onPartyServerUrlChange(value);
    if (saved) setServerDraft(String(value).trim().replace(/\/$/, ''));
  };
  const selectFolder = async () => {
    try {
      const response = await fetch('/api/select_folder', { method: 'POST' });
      const data = await response.json();
      if (data.folder_path) {
        onFolderChange(data.folder_path);
      }
    } catch (error) {
      console.error('Error al seleccionar carpeta', error);
    }
  };

  const handleExportBadSongs = () => {
    if (!badSongs || badSongs.length === 0) return;
    const content = `CANCIONES DEFECTUOSAS / A DESCARTAR\n${'-'.repeat(40)}\n` + badSongs.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canciones_descartadas.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="settings-modal-title"
      panelClassName="modal-panel settings-modal"
    >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title" id="settings-modal-title">
            <i className="fa-solid fa-gear"></i>
            <span>Configuración</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Cerrar">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="modal-body">

          {/* Sección: Biblioteca */}
          <div className="settings-section">
            <div className="settings-section-label">
              <i className="fa-solid fa-compact-disc"></i>
              Biblioteca musical
            </div>
            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-title">Carpeta actual</span>
                <span className="settings-row-value" title={currentFolder}>
                  {currentFolder || 'No seleccionada'}
                </span>
              </div>
              <button className="btn btn-secondary settings-btn" onClick={selectFolder}>
                <i className="fa-solid fa-folder-tree"></i>
                Cambiar carpeta
              </button>
            </div>
          </div>

          <div className="settings-divider" />

          {/* Sección: Modo fiesta */}
          <div className="settings-section">
            <div className="settings-section-label">
              <i className="fa-solid fa-champagne-glasses"></i>
              Modo fiesta
            </div>
            <form className="settings-party-server" onSubmit={savePartyServer}>
              <label className="settings-row-info">
                <span className="settings-row-title">URL del servidor</span>
                <span className="settings-row-value">Usada para conectar la consola con las salas de fiesta.</span>
              </label>
              <div className="settings-party-server-controls">
                <input type="url" value={serverDraft ?? partyServerUrl} onChange={(event) => setServerDraft(event.target.value)} placeholder="http://127.0.0.1:8000" required />
                <button type="submit" className="btn btn-secondary settings-btn"><i className="fa-solid fa-floppy-disk"></i> Guardar</button>
              </div>
            </form>
          </div>

          <div className="settings-divider" />

          {/* Sección: Canciones defectuosas o descartadas */}
          <div className="settings-section">
            <div className="settings-section-label">
              <i className="fa-solid fa-flag"></i>
              Canciones marcadas para descartar ({badSongs.length})
            </div>
            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-row-title">Reporte de pistas defectuosas</span>
                <span className="settings-row-value">
                  {badSongs.length === 0 ? 'No hay canciones marcadas' : `${badSongs.length} pista(s) en la lista`}
                </span>
              </div>
              {badSongs.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-secondary settings-btn" onClick={handleExportBadSongs} title="Descargar reporte .txt">
                    <i className="fa-solid fa-download"></i> .txt
                  </button>
                  <button className="btn btn-secondary settings-btn" onClick={() => setBadSongs([])} style={{ color: '#ff6b6b' }} title="Limpiar lista">
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="settings-divider" />

          {/* Sección: Acerca de */}
          <div className="settings-section">
            <div className="settings-section-label">
              <i className="fa-solid fa-circle-info"></i>
              Acerca de
            </div>
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
              <span className="settings-about-brand"><img src="/logo.svg" alt="" /> Q'Suene</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>La música la ponemos todos</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Desarrollado por Gonzalo Andrés Lucio</span>
              <details className="settings-license-details">
                <summary><i className="fa-solid fa-scale-balanced"></i> Licencias y marca</summary>
                <div className="settings-license-copy">
                  <p><strong>Software:</strong> GNU AGPLv3 o posterior. Las versiones modificadas, incluso si se ofrecen por red, deben mantener disponible su código fuente.</p>
                  <p><strong>Documentación y recursos propios:</strong> CC BY-SA 4.0.</p>
                  <p><strong>Marca:</strong> Q'Suene, su nombre y logotipo no pueden usarse para presentar una versión derivada como producto oficial sin autorización.</p>
                  <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">Leer AGPLv3</a>
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noreferrer">Leer CC BY-SA 4.0</a>
                </div>
              </details>
            </div>
          </div>

        </div>
    </ModalShell>
  );
}

export default SettingsModal;
