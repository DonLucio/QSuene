export default function GuestNotifications({ notification, showUpNext, upNextNotice, upcomingSeconds, celebration }) {
  return <>
    {notification && <div className={`party-toast is-${notification.type}`} role="status"><span>{notification.type === 'error' ? '!' : '✓'}</span>{notification.message}</div>}
    {showUpNext && <aside className="up-next-party" role="status" aria-live="polite"><div><span>YA CASI SUENA TU CANCIÓN</span><strong>{upNextNotice.title}</strong></div><b>{upcomingSeconds}<small>s</small></b></aside>}
    {celebration && <aside className="song-celebration" role="status" aria-live="assertive" style={{ '--celebration-duration': `${celebration.overlayDurationMs}ms` }}>
      <canvas className="celebration-confetti-canvas" aria-hidden="true" />
      <div className="celebration-copy"><span>¡AHORA SUENA TU CANCIÓN!</span><strong>{celebration.title}</strong></div>
    </aside>}
  </>
}
