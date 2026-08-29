import React, { useRef } from 'react';
import WishlistPopover from '../library/WishlistPopover';

function TopHeader({
  theme,
  setTheme,
  wishlistCount,
  currentFolder,
  isPlaying,
  onOpenSettings,
  onSelectFolder,
  // Wishlist popover props
  isWishlistOpen,
  setIsWishlistOpen,
  wishlist,
  setWishlist,
  // Download progress props
  isDownloadActive,
  downloadProgress,
  onStartDownload,
}) {
  const heartBtnRef = useRef(null);


  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", newTheme);
    setTheme(newTheme);
  };

  const folderDisplayName = currentFolder
    ? (currentFolder.split('\\').filter(Boolean).pop() || currentFolder.split('/').filter(Boolean).pop() || currentFolder)
    : 'Carpeta';

  return (
    <div className="app-topbar">
      {/* Brand identity */}
      <div className="app-brand">
        <div className="brand-title">
          <svg
            className={`brand-logo-svg ${isPlaying ? 'is-playing' : ''}`}
            width="50"
            height="50"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path className="brand-bar brand-bar-1" d="M 4.54,10 V 13" stroke="#fafafa" strokeWidth="1.7" strokeLinecap="round" />
            <path className="brand-bar brand-bar-2 orange-bar" d="M 7.54,7 V 16" stroke="#f06812" strokeWidth="1.7" strokeLinecap="round" />
            <path className="brand-bar brand-bar-3" d="M 10.54,4 V 19" stroke="#fafafa" strokeWidth="1.7" strokeLinecap="round" />
            <path className="brand-bar brand-bar-4" d="M 13.54,7 V 16" stroke="#fafafa" strokeWidth="1.7" strokeLinecap="round" />
            <path className="brand-bar brand-bar-5" d="M 16.54,10 V 13" stroke="#fafafa" strokeWidth="1.7" strokeLinecap="round" />
            <path className="brand-bar brand-bar-6" d="M 19.54,7 V 16" stroke="#fafafa" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Q'Suene</span>
        </div>
        <div className="brand-slogan">La música la ponemos todos</div>
      </div>


      {/* Center: Quick Directory Pill */}
      <div
        className="topbar-dir-pill"
        onClick={onSelectFolder || onOpenSettings}
        title={`Carpeta actual: ${currentFolder || 'Ninguna'} (Clic para cambiar carpeta)`}
      >
        <i className="fa-solid fa-folder-open"></i>
        <span className="topbar-dir-name">{folderDisplayName}</span>
        <button
          className="topbar-dir-change-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onSelectFolder) onSelectFolder();
            else onOpenSettings();
          }}
          title="Cambiar carpeta de música"
        >
          Cambiar
        </button>
      </div>

      {/* Compact icon actions */}
      <div className="app-topbar-actions">

        {/* Wishlist icon + popover */}
        <div className="wishlist-anchor" style={{ position: 'relative' }}>
          <button
            ref={heartBtnRef}
            className={`topbar-icon-btn ${isWishlistOpen ? 'active' : ''}`}
            onClick={() => setIsWishlistOpen(prev => !prev)}
            title={wishlistCount > 0 ? `Lista de deseos (${wishlistCount}/5)` : 'Lista de deseos'}
          >
            {isDownloadActive ? (
              <i className="fa-solid fa-arrow-down fa-bounce" style={{ color: '#38bdf8' }}></i>
            ) : (
              <i className={`fa-${isWishlistOpen ? 'solid' : 'regular'} fa-heart`}></i>
            )}
            {wishlistCount > 0 && !isDownloadActive && (
              <span className="topbar-badge">{wishlistCount}</span>
            )}
            {isDownloadActive && downloadProgress && (
              <span className="topbar-badge topbar-badge--download">{downloadProgress}</span>
            )}
          </button>

          <WishlistPopover
            isOpen={isWishlistOpen}
            onClose={() => setIsWishlistOpen(false)}
            anchorRef={heartBtnRef}
            wishlist={wishlist}
            setWishlist={setWishlist}
            isDownloadActive={isDownloadActive}
            downloadProgress={downloadProgress}
            onStartDownload={onStartDownload}
          />

        </div>

        {/* Theme toggle */}
        <button
          className="topbar-icon-btn theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          {theme === "dark" ? (
            <i className="fa-solid fa-moon" style={{ color: '#38bdf8' }}></i>
          ) : (
            <i className="fa-solid fa-sun" style={{ color: '#eab308' }}></i>
          )}
        </button>

        {/* Settings Gear */}
        <button
          className="topbar-icon-btn settings-toggle-btn"
          onClick={onOpenSettings}
          title="Configuración"
        >
          <i className="fa-solid fa-gear"></i>
        </button>
      </div>
    </div>
  );
}

export default TopHeader;
