import React, { useState, useEffect, useRef } from 'react';
import headerImage from '../../../desktop/frontend/src/assets/header-party-dj-v5.png';

const LATEST_RELEASE_API = 'https://api.github.com/repos/DonLucio/QSuene/releases/latest';

export default function LandingPage({ onJoinRoom, apiUrl, notice = '' }) {
  const [publicParties, setPublicParties] = useState([]);
  const [loadingParties, setLoadingParties] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [windowsRelease, setWindowsRelease] = useState({ status: 'idle', url: '', version: '' });
  const [partiesError, setPartiesError] = useState('');
  const pinDialogRef = useRef(null);
  const downloadDialogRef = useRef(null);
  const licenseDialogRef = useRef(null);

  // Poll active public rooms
  useEffect(() => {
    let isMounted = true;
    const fetchPublicParties = async () => {
      try {
        setPartiesError('');
        const res = await fetch(`${apiUrl}/api/v1/parties/public`);
        if (!res.ok) throw new Error('El servidor de fiestas no está disponible');
        const data = await res.json();
        if (isMounted) setPublicParties(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isMounted) setPartiesError('No pudimos consultar el servidor de fiestas. Intenta nuevamente en unos segundos.');
      } finally {
        if (isMounted) setLoadingParties(false);
      }
    };

    fetchPublicParties();
    const interval = setInterval(fetchPublicParties, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiUrl]);

  useEffect(() => {
    if (!showDownloadModal || windowsRelease.status === 'ready') return undefined;
    const controller = new AbortController();
    setWindowsRelease({ status: 'loading', url: '', version: '' });
    fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error(`Release no disponible (${response.status})`);
        return response.json();
      })
      .then(release => {
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const installer = assets.find(asset => asset.name?.toLowerCase().endsWith('.msi'))
          || assets.find(asset => asset.name?.toLowerCase().endsWith('.exe'));
        if (!installer?.browser_download_url) throw new Error('El release no contiene instalador para Windows');
        setWindowsRelease({
          status: 'ready',
          url: installer.browser_download_url,
          version: release.tag_name || release.name || 'estable',
        });
      })
      .catch(error => {
        if (error.name !== 'AbortError') setWindowsRelease({ status: 'unavailable', url: '', version: '' });
      });
    return () => controller.abort();
  }, [showDownloadModal]);

  useEffect(() => {
    if (!showPinModal && !showDownloadModal && !showLicenseModal) return undefined;
    const close = (event) => {
      if (event.key !== 'Escape') return;
      setShowPinModal(false);
      setShowDownloadModal(false);
      setShowLicenseModal(false);
    };
    window.addEventListener('keydown', close);
    requestAnimationFrame(() => (showPinModal ? pinDialogRef.current : showDownloadModal ? downloadDialogRef.current : licenseDialogRef.current)?.focus());
    return () => window.removeEventListener('keydown', close);
  }, [showDownloadModal, showLicenseModal, showPinModal]);

  const handlePinSubmit = (e) => {
    e.preventDefault();
    const code = pinInput.trim().toUpperCase();
    if (!code) return;
    onJoinRoom(code);
  };

  return (
    <div className="landing-container">
      {/* Background Glows */}
      <div className="landing-bg-glow glow-1"></div>
      <div className="landing-bg-glow glow-2"></div>
      <div className="landing-bg-glow glow-3"></div>

      <div className="landing-hero-cover" style={{ '--landing-header-image': `url(${headerImage})` }}>
      {notice && <div className="landing-room-notice" role="status"><i className="fa-solid fa-circle-info"></i> {notice}</div>}
      {/* Top Navbar */}
      <header className="landing-navbar">
        <div className="landing-brand">
          <svg className="landing-logo-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path className="l-bar l-bar-1" d="M 4.54,10 V 13" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
            <path className="l-bar l-bar-2 orange-bar" d="M 7.54,7 V 16" stroke="#f06812" strokeWidth="1.8" strokeLinecap="round" />
            <path className="l-bar l-bar-3" d="M 10.54,4 V 19" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
            <path className="l-bar l-bar-4" d="M 13.54,7 V 16" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
            <path className="l-bar l-bar-5" d="M 16.54,10 V 13" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
            <path className="l-bar l-bar-6" d="M 19.54,7 V 16" stroke="#fafafa" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div className="landing-brand-text">
            <span className="landing-brand-name">Q'Suene</span>
            <span className="landing-brand-tagline">La música la ponemos todos</span>
          </div>
        </div>

        <div className="landing-nav-actions">
          <button 
            type="button" 
            className="landing-nav-btn btn-glass"
            onClick={() => setShowPinModal(true)}
          >
            <i className="fa-solid fa-key"></i> Ingresar PIN
          </button>
          <button 
            type="button" 
            className="landing-nav-btn btn-primary"
            onClick={() => setShowDownloadModal(true)}
          >
            <i className="fa-brands fa-windows"></i> Descargar PC
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-brand-display" aria-label="Q'Suene">
          <svg className="hero-brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M 4.54,10 V 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M 7.54,7 V 16" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M 10.54,4 V 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M 13.54,7 V 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M 16.54,10 V 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M 19.54,7 V 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>Q'Suene</span>
        </div>
        <div className="landing-badge">
          <span className="pulse-indicator"></span> Plataforma Interactiva de Fiestas y DJs
        </div>
        <h1 className="landing-title">
          El reproductor donde <span className="text-gradient">TÚ decides</span> qué suena.
        </h1>
        <p className="landing-subtitle">
          Pide tus canciones favoritas desde tu celular sin descargar nada y sé parte del ambiente musical de la fiesta.
        </p>

        <div className="hero-flow" aria-label="Cómo funciona">
          <span><i className="fa-solid fa-magnifying-glass"></i> Busca</span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
          <span><i className="fa-solid fa-hand-pointer"></i> Pide</span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
          <span><i className="fa-solid fa-volume-high"></i> Que suene</span>
        </div>

        {/* Quick Pin Input in Hero */}
        <div className="hero-action-box">
          <form onSubmit={handlePinSubmit} className="hero-pin-form">
            <div className="pin-input-wrapper">
              <i className="fa-solid fa-hashtag pin-icon"></i>
              <input
                type="text"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                placeholder="CÓDIGO O PIN"
                className="hero-pin-input"
              />
            </div>
            <button type="submit" className="hero-pin-submit btn-primary" disabled={!pinInput.trim()}>
              Unirme a la Fiesta <i className="fa-solid fa-arrow-right"></i>
            </button>
          </form>

          <div className="hero-download-prompt">
            <span>¿Eres DJ o anfitrión del evento?</span>
            <button 
              type="button" 
              className="link-download"
              onClick={() => setShowDownloadModal(true)}
            >
              Descarga la app para Windows <i className="fa-solid fa-download"></i>
            </button>
          </div>
        </div>
      </section>
      <div className="hero-scroll-cue" aria-hidden="true"><span></span> Fiestas en vivo</div>
      </div>

      {/* Live Section: Fiestas Públicas en Vivo */}
      <section className="landing-public-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <span className="live-tag"><span className="live-dot"></span> EN VIVO</span>
            <h2>Fiestas Públicas</h2>
          </div>
          <p className="section-desc">
            Salas abiertas ahora mismo. Puedes entrar y pedir música (máximo 10 invitados por sala pública).
          </p>
        </div>

        {loadingParties ? (
          <div className="public-parties-loading">
            <i className="fa-solid fa-circle-notch fa-spin"></i> Buscando fiestas públicas activas...
          </div>
        ) : partiesError ? (
          <div className="public-parties-empty" role="alert">
            <div className="empty-icon-wrap"><i className="fa-solid fa-triangle-exclamation"></i></div>
            <h3>Servidor de fiestas no disponible</h3><p>{partiesError}</p>
          </div>
        ) : publicParties.length === 0 ? (
          <div className="public-parties-empty">
            <div className="empty-icon-wrap">
              <i className="fa-solid fa-compact-disc fa-spin-pulse"></i>
            </div>
            <h3>No hay fiestas públicas en este momento</h3>
            <p>
              Si tienes el reproductor <b>Q'Suene</b> en tu PC, activa el switch <b>"Fiesta Pública"</b> en tu panel de DJ para que tu sala aparezca aquí.
            </p>
            <button 
              type="button" 
              className="btn-glass btn-sm"
              onClick={() => setShowPinModal(true)}
            >
              <i className="fa-solid fa-key"></i> Tengo un código de fiesta privada
            </button>
          </div>
        ) : (
          <div className="public-parties-grid">
            {publicParties.map((party) => (
              <div key={party.id || party.code} className="party-card">
                <div className="party-card-header">
                  <div className="party-card-name">
                    <i className="fa-solid fa-music text-accent"></i>
                    <h4>{party.name || `Fiesta ${party.code}`}</h4>
                  </div>
                  <span className="party-badge-code">{party.code}</span>
                </div>

                <div className="party-card-body">
                  <div className="party-dj-row">
                    <i className="fa-solid fa-headphones"></i>
                    <span>DJ: <b>{party.dj_name || 'DJ Anfitrión'}</b></span>
                  </div>

                  <div className="party-playing-row">
                    <span className="playing-label">Sonando:</span>
                    <span className="playing-track">
                      {party.playback?.current?.title 
                        ? `🎵 ${party.playback.current.title} - ${party.playback.current.artist || ''}`
                        : '⏸️ En pausa o esperando pista'}
                    </span>
                  </div>

                  <div className="party-slots-row">
                    <div className="slots-info">
                      <span>Cupos públicos:</span>
                      <b>{party.guest_count ?? party.connected_guests} / {party.max_public_guests || 10}</b>
                    </div>
                    <div className="slots-bar">
                      <div 
                        className="slots-fill"
                        style={{ width: `${Math.min(100, ((party.guest_count ?? party.connected_guests) / (party.max_public_guests || 10)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="party-card-footer">
                  <button
                    type="button"
                    className="btn-join-public btn-primary"
                    disabled={party.available_slots <= 0}
                    onClick={() => onJoinRoom(party.code)}
                  >
                    {party.available_slots > 0 ? (
                      <>Entrar a la Fiesta <i className="fa-solid fa-arrow-right"></i></>
                    ) : (
                      <>Sala Llena (10/10)</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Features Grid */}
      <section className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">
            <i className="fa-solid fa-mobile-screen-button"></i>
          </div>
          <h3>100% Web sin Descargas</h3>
          <p>Los invitados solo escanean el código QR con la cámara de su celular y pueden pedir canciones al instante.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">
            <i className="fa-solid fa-sliders"></i>
          </div>
          <h3>Control Total para el DJ</h3>
          <p>Límites de canciones por usuario, rotación cíclica equitativa y control de veto de canciones o usuarios molestos.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">
            <i className="fa-solid fa-bolt"></i>
          </div>
          <h3>Sincronización en Tiempo Real</h3>
          <p>Actualización instantánea por WebSockets de lo que está sonando, pedidos en cola y biblioteca del DJ.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} <b>Q'Suene</b> · La música la ponemos todos.</p>
        <p className="landing-developer-credit">
          Desarrollado por{' '}
          <a href="https://www.gonzaloandreslucio.com" target="_blank" rel="noopener noreferrer">
            Gonzalo Andrés Lucio
          </a>
        </p>
        <button type="button" className="landing-license-link" onClick={() => setShowLicenseModal(true)}>
          <i className="fa-solid fa-scale-balanced"></i> Licencias y uso de marca
        </button>
      </footer>

      {showLicenseModal && (
        <div className="landing-modal-backdrop" onClick={() => setShowLicenseModal(false)}>
          <div ref={licenseDialogRef} className="landing-modal-card license-modal-card" role="dialog" aria-modal="true" aria-labelledby="license-dialog-title" tabIndex="-1" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close-btn" aria-label="Cerrar" onClick={() => setShowLicenseModal(false)}>×</button>
            <div className="modal-header">
              <i className="fa-solid fa-scale-balanced modal-icon text-accent"></i>
              <h3 id="license-dialog-title">Licencias de Q'Suene</h3>
              <p>Libertad para crecer, obligación de compartir las mejoras y protección de la identidad oficial.</p>
            </div>
            <div className="license-summary-list">
              <article><strong>Software · GNU AGPLv3+</strong><p>Puedes usar, estudiar y modificar Q'Suene. Si distribuyes una versión o la ofreces a usuarios por red, debes facilitar su código fuente bajo la misma licencia.</p><a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">Texto completo de AGPLv3</a></article>
              <article><strong>Documentación · CC BY-SA 4.0</strong><p>La documentación y los recursos originales pueden compartirse y adaptarse con atribución y bajo la misma licencia.</p><a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noopener noreferrer">Texto de CC BY-SA 4.0</a></article>
              <article><strong>Nombre y logotipo Q'Suene</strong><p>Una versión derivada debe utilizar identidad propia y no puede presentarse como oficial sin autorización de Gonzalo Andrés Lucio.</p></article>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ingreso manual de PIN */}
      {showPinModal && (
        <div className="landing-modal-backdrop" onClick={() => setShowPinModal(false)}>
          <div ref={pinDialogRef} className="landing-modal-card" role="dialog" aria-modal="true" aria-labelledby="pin-dialog-title" tabIndex="-1" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" aria-label="Cerrar" onClick={() => setShowPinModal(false)}>×</button>
            <div className="modal-header">
              <i className="fa-solid fa-key modal-icon"></i>
              <h3 id="pin-dialog-title">Unirse a una Fiesta</h3>
              <p>Ingresa el código de 6 caracteres proporcionado por el DJ</p>
            </div>
            <form onSubmit={handlePinSubmit} className="modal-form">
              <input
                type="text"
                autoFocus
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                placeholder="EJ: 8F2K9L"
                className="modal-pin-input"
              />
              <button type="submit" className="btn-primary btn-block" disabled={!pinInput.trim()}>
                Ingresar a la Sala
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Descargar Q'Suene */}
      {showDownloadModal && (
        <div className="landing-modal-backdrop" onClick={() => setShowDownloadModal(false)}>
          <div ref={downloadDialogRef} className="landing-modal-card" role="dialog" aria-modal="true" aria-labelledby="download-dialog-title" tabIndex="-1" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" aria-label="Cerrar" onClick={() => setShowDownloadModal(false)}>×</button>
            <div className="modal-header">
              <i className="fa-brands fa-windows modal-icon text-accent"></i>
              <h3 id="download-dialog-title">Descargar Q'Suene para Windows</h3>
              <p>El reproductor interactivo con Party Platform integrada para DJs y anfitriones.</p>
            </div>
            
            <div className="download-info-list">
              <div className="dl-item">
                <i className="fa-solid fa-check text-success"></i>
                <span>Funciona 100% offline o conectado a la nube</span>
              </div>
              <div className="dl-item">
                <i className="fa-solid fa-check text-success"></i>
                <span>Ecualizador dinámico y gestión de metadatos</span>
              </div>
              <div className="dl-item">
                <i className="fa-solid fa-check text-success"></i>
                <span>Generador de códigos QR para fiestas al instante</span>
              </div>
            </div>

            <div className="modal-footer-actions">
              <button 
                type="button" 
                className="btn-primary btn-block"
                disabled={windowsRelease.status !== 'ready'}
                onClick={() => {
                  window.location.assign(windowsRelease.url);
                  setShowDownloadModal(false);
                }}
              >
                <i className={`fa-solid ${windowsRelease.status === 'loading' ? 'fa-circle-notch fa-spin' : 'fa-download'}`}></i>{' '}
                {windowsRelease.status === 'loading' && 'Buscando última versión...'}
                {windowsRelease.status === 'ready' && `Descargar ${windowsRelease.version}`}
                {windowsRelease.status === 'unavailable' && 'Primera versión en preparación'}
              </button>
              <span className="dl-subtext">
                {windowsRelease.status === 'unavailable'
                  ? 'El instalador aparecerá aquí al publicar la primera versión estable.'
                  : 'Selecciona automáticamente el MSI estable más reciente · Windows 10 y 11'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
