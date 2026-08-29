import { useState } from 'react';

export default function DjAssistedSearch({ query, enabled, onSearch, onSelect }) {
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [attribution, setAttribution] = useState(null);
  const [selectedKey, setSelectedKey] = useState('');

  const search = async () => {
    setStatus('loading');
    try {
      const data = await onSearch(query);
      setResults(data.results || []);
      setAttribution(data.attribution || null);
      setStatus(data.results?.length ? 'results' : 'empty');
    } catch {
      setStatus('error');
    }
  };

  const select = async (song) => {
    const key = `${song.artist}|${song.title}`;
    setSelectedKey(key);
    const accepted = await onSelect(song);
    setSelectedKey('');
    if (accepted) setStatus('added');
  };

  if (!enabled || String(query || '').trim().length < 2) return null;

  return (
    <section className="dj-assisted-search" aria-live="polite">
      {status === 'idle' && (
        <div className="dj-assisted-cta">
          <div>
            <i className="fa-brands fa-lastfm" aria-hidden="true"></i>
            <span><strong>¿No está en tu biblioteca?</strong> Amplía esta búsqueda en Last.fm.</span>
          </div>
          <button type="button" onClick={search}>
            <i className="fa-solid fa-wand-magic-sparkles"></i> Buscar en Last.fm
          </button>
        </div>
      )}
      {status === 'loading' && <div className="dj-assisted-state"><i className="fa-solid fa-circle-notch fa-spin"></i> Consultando Last.fm…</div>}
      {status === 'empty' && <div className="dj-assisted-state">No encontramos coincidencias externas. Prueba otra búsqueda.</div>}
      {status === 'error' && <div className="dj-assisted-state is-error"><span>No fue posible consultar Last.fm.</span><button type="button" onClick={search}>Reintentar</button></div>}
      {status === 'added' && <div className="dj-assisted-state is-success"><i className="fa-solid fa-check"></i> Canción agregada a la lista de deseos.</div>}
      {status === 'results' && (
        <>
          <div className="dj-assisted-heading"><span>Coincidencias en Last.fm</span><b>{results.length}</b></div>
          <div className="dj-assisted-results">
            {results.map(song => {
              const key = `${song.artist}|${song.title}`;
              return (
                <article key={key}>
                  <div><strong>{song.title}</strong><span>{song.artist}</span></div>
                  {song.provider_url && <a href={song.provider_url} target="_blank" rel="noreferrer" title="Ver en Last.fm"><i className="fa-solid fa-arrow-up-right-from-square"></i></a>}
                  <button type="button" disabled={Boolean(selectedKey)} onClick={() => select(song)} title="Agregar a deseos">
                    <i className={`fa-solid ${selectedKey === key ? 'fa-circle-notch fa-spin' : 'fa-plus'}`}></i>
                  </button>
                </article>
              );
            })}
          </div>
          {attribution?.url && <a className="dj-lastfm-attribution" href={attribution.url} target="_blank" rel="noreferrer">{attribution.label}</a>}
        </>
      )}
    </section>
  );
}
