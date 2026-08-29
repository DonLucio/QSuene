import GuestNotifications from './GuestNotifications'
import PlaybackStatus from './PlaybackStatus'

export default function GuestPartyPage({ children, notification, showUpNext, upNextNotice,
  upcomingSeconds, celebration, playback, connected, playbackPositionMs, playbackProgress,
  nextQueuedItem, guestName, activeView, onViewChange, queueCount }) {
  return <main className="shell">
    <GuestNotifications notification={notification} showUpNext={showUpNext} upNextNotice={upNextNotice} upcomingSeconds={upcomingSeconds} celebration={celebration} />
    <PlaybackStatus playback={playback} connected={connected} positionMs={playbackPositionMs} progress={playbackProgress} nextItem={nextQueuedItem} guestName={guestName} />
    {children}
    <nav className="mobile-tabs" aria-label="Navegación de fiesta">
      <button className={activeView === 'library' ? 'active' : ''} onClick={() => onViewChange('library')}>
        <span className="tab-icon">⌕</span><span>Pedir</span>
      </button>
      <button className={activeView === 'queue' ? 'active' : ''} onClick={() => onViewChange('queue')}>
        <span className="tab-icon">☷</span><span>Cola</span><em>{queueCount}</em>
      </button>
    </nav>
  </main>
}
