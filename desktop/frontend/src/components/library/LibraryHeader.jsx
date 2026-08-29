import React, { useState, useEffect, useRef } from 'react';

function LibraryHeader({ onSearchChange, rating, onRatingChange, onBulkEdit, onRefresh, isRefreshing, visibleColumns, setVisibleColumns, filteredCount, totalCount, onClearSearch }) {
  const [query, setQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuOpenUp, setMenuOpenUp] = useState(false);
  const [colsExpanded, setColsExpanded] = useState(false);

  const menuBtnRef = useRef(null);
  const menuRef = useRef(null);

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => onSearchChange(query), 180);
    return () => clearTimeout(id);
  }, [query]); // eslint-disable-line

  // Close on click outside
  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          menuBtnRef.current && !menuBtnRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMenuOpen]);

  // Close on Esc
  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setIsMenuOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isMenuOpen]);

  // Smart popover positioning
  const openMenu = () => {
    if (isMenuOpen) { setIsMenuOpen(false); return; }
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setMenuOpenUp(spaceBelow < 380);
    }
    setIsMenuOpen(true);
  };

  const toggleColumn = (col) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const hasActiveFilter = rating > 0;
  const activeFilterCount = hasActiveFilter ? 1 : 0;

  const COLUMN_LABELS = {
    title: 'Título', artist: 'Artista', album: 'Álbum',
    genre: 'Género', duration: 'Duración', location: 'Ubicación'
  };

  return (
    <div className="lib-header">
      {/* Title + count */}
      <div className="lib-title-group">
        <div className="lib-title">
          <i className="fa-solid fa-compact-disc"></i>
          <span>Biblioteca</span>
          <button
            type="button"
            className="lib-refresh-btn"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Volver a leer los archivos y actualizar el catálogo de invitados"
            aria-label="Recargar biblioteca"
          >
            <i className={`fa-solid fa-rotate-right ${isRefreshing ? 'fa-spin' : ''}`}></i>
          </button>
        </div>
        {totalCount > 0 && (
          <span className="lib-song-count">
            {filteredCount === totalCount 
              ? `${totalCount.toLocaleString()} canciones` 
              : `${filteredCount.toLocaleString()} resultados de ${totalCount.toLocaleString()} canciones`}
            {hasActiveFilter && (
              <button
                className="lib-filter-chip"
                onClick={() => onRatingChange(0)}
                title="Quitar filtro de estrellas"
              >
                {'★'.repeat(rating)} ×
              </button>
            )}
          </span>
        )}
      </div>

      {/* Controls: Search first, Options second */}
      <div className="lib-controls">

        {/* Search input */}
        <div className="search-container">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar canciones, artistas o álbumes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="search-clear-btn"
              onClick={() => { setQuery(''); onClearSearch(); }}
              title="Limpiar búsqueda"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        {/* Options button */}
        <div className="lib-options-wrapper">
          <button
            ref={menuBtnRef}
            className={`btn btn-secondary lib-options-btn ${isMenuOpen ? 'active' : ''}`}
            onClick={openMenu}
            title="Opciones de biblioteca"
          >
            <i className="fa-solid fa-sliders"></i>
            <span>Opciones</span>
            {activeFilterCount > 0 && (
              <span className="lib-options-badge">{activeFilterCount}</span>
            )}
          </button>

          {isMenuOpen && (
            <div
              ref={menuRef}
              className="lib-popover"
              style={{ [menuOpenUp ? 'bottom' : 'top']: 'calc(100% + 8px)' }}
            >
              {/* ACCIONES */}
              <div className="lib-popover-section">
                <span className="lib-popover-label">Acciones</span>
                <button
                  className="lib-popover-action"
                  onClick={() => { onBulkEdit(); setIsMenuOpen(false); }}
                >
                  <i className="fa-solid fa-tags"></i>
                  Cambiar género en lote
                </button>
              </div>

              <div className="lib-popover-divider" />

              {/* FILTRAR */}
              <div className="lib-popover-section">
                <span className="lib-popover-label">Filtrar</span>
                <div className="lib-popover-row">
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Valoración</span>
                  <select
                    className="lib-popover-select"
                    value={rating}
                    onChange={(e) => onRatingChange(parseInt(e.target.value) || 0)}
                  >
                    <option value="0">Todas</option>
                    <option value="5">★★★★★</option>
                    <option value="4">★★★★+</option>
                    <option value="3">★★★+</option>
                    <option value="2">★★+</option>
                    <option value="1">★+</option>
                  </select>
                </div>
              </div>

              <div className="lib-popover-divider" />

              {/* VISTA — columnas colapsables */}
              <div className="lib-popover-section">
                <button
                  className="lib-popover-collapsible"
                  onClick={() => setColsExpanded(!colsExpanded)}
                >
                  <span className="lib-popover-label" style={{ margin: 0 }}>Vista</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <i className={`fa-solid fa-chevron-${colsExpanded ? 'up' : 'down'}`}></i>
                  </span>
                </button>
                {colsExpanded && (
                  <div className="lib-popover-cols">
                    {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                      <label key={key} className="lib-popover-check">
                        <input
                          type="checkbox"
                          checked={visibleColumns[key] !== false}
                          onChange={() => toggleColumn(key)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LibraryHeader;
