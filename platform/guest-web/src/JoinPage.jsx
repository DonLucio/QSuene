export default function JoinPage({ roomCode, guestName, setGuestName, error, onJoin, onBack }) {
  return <main className="shell join-shell">
    <button type="button" className="back-landing-link" onClick={onBack}><i className="fa-solid fa-arrow-left"></i> Volver a la página principal</button>
    <p className="eyebrow guest-brand"><img className="guest-brand-svg" src="/logo.svg" alt="" /> Q'Suene</p>
    <h1>Entra a la fiesta <span className="room-code-pill">#{roomCode}</span></h1>
    <p className="muted">Confirma tu nombre para empezar a pedir música.</p>
    <form className="card form" onSubmit={onJoin}>
      <label>Tu nombre<input value={guestName} onChange={event => setGuestName(event.target.value)} maxLength="40" required autoFocus /></label>
      <button disabled={!roomCode.trim()}>Conectar y Pedir Música</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </main>
}
