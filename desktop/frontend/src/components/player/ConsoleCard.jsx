import React, { useState, useEffect, useRef } from 'react';

function ConsoleCard({ 
  currentSong, isPlaying, onPlayToggle, isShuffle, onShuffleToggle, isRepeat, onRepeatToggle, onNext, onPrev,
  currentTime, duration, volume, onSeek, onVolumeChange, onRpmChange
}) {
  // RPM selector: only affects vinyl rotation speed, NOT audio
  const [rpm, setRpm] = useState(() => parseInt(localStorage.getItem('rpm') || '33'));

  // Marquee state: detect title overflow
  const titleRef = useRef(null);
  const [titleOverflows, setTitleOverflows] = useState(false);

  useEffect(() => {
    localStorage.setItem('rpm', rpm);
    onRpmChange?.(rpm);
  }, [onRpmChange, rpm]);

  // Detect title overflow whenever the song changes
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => setTitleOverflows(el.scrollWidth > el.clientWidth + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentSong?.title]);

  const formatTime = (secs) => {
    if (isNaN(secs) || !secs || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e) => {
    if (!duration) return;
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  };

  const handleVolumeClick = (e) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onVolumeChange(pct);
  };

  let volumeIcon = 'fa-solid fa-volume-high';
  if (!volume || volume === 0) volumeIcon = 'fa-solid fa-volume-xmark';
  else if (volume < 0.4) volumeIcon = 'fa-solid fa-volume-low';

  // Vinyl rotation speed based on RPM selector
  const vinylDuration = rpm === 45 ? '1.33s' : '1.8s';
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`console-card ${isPlaying ? 'playing' : ''}`}>
      
      {/* COLUMN 1: Vinyl Disc */}
      <div className="vinyl-container">
        <div 
          className="vinyl-disc"
          style={isPlaying ? { animation: `rotate-vinyl ${vinylDuration} linear infinite, pulse-glow 5s ease-in-out infinite` } : {}}
        >
          <div className="vinyl-center"></div>
        </div>
      </div>

      {/* COLUMN 2: Info + Controls */}
      <div className="player-info">
        
        {/* Top: Song info */}
        <div className="player-meta">
          <div className="now-playing-label">
            {isPlaying ? (
              <>
                <span className="np-dot"></span>
                Reproduciendo
              </>
            ) : currentSong ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Pausado</span>
            ) : null}
          </div>

          {/* Smart marquee title */}
          <div className="song-title-wrap">
            <div
              ref={titleRef}
              className={`song-title ${!currentSong ? 'song-title--empty' : ''} ${titleOverflows && isPlaying ? 'marquee-active' : ''}`}
              title={currentSong?.title}
            >
              {currentSong ? currentSong.title.replace(/^\d{1,3}\s*[.\-_]\s*/, '') : 'Ninguna canción seleccionada'}
            </div>
          </div>

          <div className={`song-artist ${!currentSong ? 'song-artist--empty' : ''}`} title={currentSong?.artist}>
            {currentSong ? currentSong.artist : 'Selecciona una pista del listado'}
          </div>
          {currentSong && (
            <div className="song-bitrate">{currentSong.bitrate} kbps · MP3</div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="player-progress-section">
          <div 
            className="progress-bar" 
            onClick={handleProgressClick}
            title="Click para avanzar"
          >
            <div className="progress-fill" style={{ width: `${progressPct}%` }}></div>
          </div>
          <div className="progress-times">
            <span>{formatTime(currentTime)}</span>
            <span>{currentSong ? formatTime(duration) : '--:--'}</span>
          </div>
        </div>

        {/* Controls row */}
        <div className="player-controls-row">
          <button 
            className={`media-btn media-btn--tertiary ${isShuffle ? 'active' : ''}`} 
            onClick={onShuffleToggle} 
            title="Aleatorio"
          >
            <i className="fa-solid fa-shuffle"></i>
          </button>

          <button className="media-btn media-btn--secondary" onClick={onPrev} title="Anterior">
            <i className="fa-solid fa-backward-step"></i>
          </button>

          <button 
            className={`media-btn media-btn--primary ${!currentSong ? 'disabled' : ''}`} 
            onClick={onPlayToggle} 
            disabled={!currentSong}
            title={currentSong ? "Reproducir / Pausa" : "Selecciona una canción"}
          >
            <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'}></i>
          </button>

          <button className="media-btn media-btn--secondary" onClick={onNext} title="Siguiente">
            <i className="fa-solid fa-forward-step"></i>
          </button>

          <button 
            className={`media-btn media-btn--tertiary ${isRepeat ? 'active' : ''}`} 
            onClick={onRepeatToggle} 
            title="Repetir"
          >
            <i className="fa-solid fa-repeat"></i>
          </button>
        </div>

        {/* Bottom row: RPM + Volume */}
        <div className="player-bottom-row">
          
          {/* RPM Selector */}
          <div className="rpm-selector" title="Velocidad visual del vinilo">
            <span className="rpm-label">RPM</span>
            <button 
              className={`rpm-btn ${rpm === 33 ? 'rpm-btn--active' : ''}`}
              onClick={() => setRpm(33)}
            >
              33⅓
            </button>
            <div className="rpm-dot" style={{ background: rpm === 33 ? 'var(--primary)' : 'var(--text-muted)' }}></div>
            <button 
              className={`rpm-btn ${rpm === 45 ? 'rpm-btn--active' : ''}`}
              onClick={() => setRpm(45)}
            >
              45
            </button>
          </div>

          {/* Volume */}
          <div className="volume-row">
            <i 
              className={volumeIcon} 
              onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)} 
              title="Silenciar"
              style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', width: '16px', flexShrink: 0 }}
            ></i>
            <div 
              className="volume-slider" 
              onClick={handleVolumeClick}
              title="Ajustar volumen"
            >
              <div className="volume-fill" style={{ width: `${(volume ?? 0.8) * 100}%` }}></div>
            </div>
            <span className="volume-pct">{Math.round((volume ?? 0.8) * 100)}%</span>
          </div>

        </div>

      </div>
    </div>
  );
}

export default ConsoleCard;
