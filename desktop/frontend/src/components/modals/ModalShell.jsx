import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function ModalShell({ isOpen, onClose, children, ariaLabelledBy, panelClassName = '', panelStyle }) {
  const overlayRef = useRef(null);
  const mouseDownTarget = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modal = (
    <div
      ref={overlayRef}
      className="modal-overlay open"
      onMouseDown={(event) => { mouseDownTarget.current = event.target; }}
      onMouseUp={(event) => {
        if (mouseDownTarget.current === overlayRef.current && event.target === overlayRef.current) {
          onClose?.();
        }
        mouseDownTarget.current = null;
      }}
    >
      <div
        className={`modal-content ${panelClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        style={panelStyle}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default ModalShell;
