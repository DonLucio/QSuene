function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function PlaybackStatus({ playback, connected, positionMs, progress, nextItem, guestName }) {
  return <>
    <header className="party-header">
      <div className="guest-identity"><p className="brand-name"><img src="/logo.svg" alt="" /> Q'Suene</p><p className="guest-name">{(guestName || 'INVITADO').toUpperCase()}</p></div>
      <div className={`header-playback ${!connected ? 'is-reconnecting' : (playback.current ? (playback.playing ? 'is-playing' : 'is-paused') : 'is-idle')}`}>
        <span>{!connected ? 'RECONECTANDO' : (playback.current ? (playback.playing ? 'REPRODUCIENDO' : 'PAUSADO') : 'EN VIVO')}</span>
        <strong>{playback.current?.title || 'Esperando música'}</strong>
      </div>
    </header>
    <section className={`card now-playing ${playback.current ? (playback.playing ? 'is-playing' : 'is-paused') : 'is-idle'}`}>
      <div className="playing-icon">♫</div><div className="playing-copy"><p className="eyebrow">{playback.current ? (playback.playing ? 'REPRODUCIENDO' : 'PAUSADO') : 'ESPERANDO MÚSICA'}</p><h1>{playback.current?.title || 'Esperando música'}</h1><p className="muted">{playback.current?.artist || 'Tu primera solicitud puede iniciar la fiesta'}</p></div>
    </section>
    <section className="playback-timeline" aria-label="Progreso de la canción actual">
      <div className="timeline-labels"><span>{formatClock(positionMs)}</span><strong>{playback.current?.title || 'Esperando música'}</strong><span>{formatClock(playback.duration_ms)}</span></div>
      <div className="timeline-track"><i style={{ width: `${progress}%` }}></i></div>
      <div className="next-song-strip"><span>A CONTINUACIÓN</span><strong>{nextItem?.title || 'La cola está abierta'}</strong>{nextItem && <small>{nextItem.requested_by_name || 'DJ'}</small>}</div>
    </section>
  </>
}
