export default function AssistedSearch({ query, assisted, disabled = false }) {
  if (query.trim().length < 2) return null
  const { status, results, attribution, resolvingKey, search, resolve } = assisted
  return <section className="assisted-search" aria-live="polite">
    {status === 'idle' && <div className="assisted-search-cta">
      <div><strong>¿No está la que buscas?</strong><span>Podemos ayudarte a identificar canción y artista.</span></div>
      <button type="button" disabled={disabled} onClick={search}><i className="fa-solid fa-wand-magic-sparkles"></i> Ayúdame a encontrarla</button>
    </div>}
    {status === 'loading' && <div className="assisted-search-state"><i className="fa-solid fa-circle-notch fa-spin"></i><strong>Buscando en el catálogo musical…</strong></div>}
    {status === 'empty' && <div className="assisted-search-state is-empty"><i className="fa-regular fa-face-frown"></i><strong>No logramos identificar esa canción.</strong><span>Intenta una búsqueda diferente.</span></div>}
    {status === 'error' && <div className="assisted-search-state is-error"><i className="fa-solid fa-triangle-exclamation"></i><strong>No pudimos ampliar la búsqueda.</strong><button type="button" onClick={search}>Intentar de nuevo</button></div>}
    {status === 'resolved' && <div className="assisted-search-state is-resolved"><i className="fa-solid fa-check"></i><strong>Selección procesada</strong></div>}
    {status === 'results' && <>
      <div className="assisted-results-title"><div><span>COINCIDENCIAS EXTERNAS</span><strong>¿Es alguna de estas?</strong></div><b>{results.length}</b></div>
      <div className="assisted-results">
        {results.map(song => {
          const key = `${song.artist}|${song.title}`
          const resolving = resolvingKey === key
          return <article key={key}>
            <div><strong>{song.title}</strong><span>{song.artist}</span>{song.provider_url && <a href={song.provider_url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>Ver en Last.fm <i className="fa-solid fa-arrow-up-right-from-square"></i></a>}</div>
            <button type="button" disabled={disabled || Boolean(resolvingKey)} onClick={() => resolve(song)} aria-label={`Seleccionar ${song.title} de ${song.artist}`}>
              <i className={`fa-solid ${resolving ? 'fa-circle-notch fa-spin' : 'fa-plus'}`}></i>
            </button>
          </article>
        })}
      </div>
      {attribution?.url && <a className="lastfm-attribution" href={attribution.url} target="_blank" rel="noreferrer">{attribution.label}</a>}
    </>}
  </section>
}
