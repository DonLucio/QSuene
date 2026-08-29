import { QRCodeSVG } from 'qrcode.react';
import ModalShell from './ModalShell';

function PartyQrModal({ isOpen, joinUrl, onClose }) {
  if (!isOpen || !joinUrl) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="party-qr-title"
      panelClassName="party-qr-modal"
    >
      <div className="party-qr-header">
        <div>
          <p>ACCESO DE INVITADOS</p>
          <h3 id="party-qr-title">Escanea para unirte</h3>
        </div>
        <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar código QR">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div className="party-qr-code">
        <QRCodeSVG
          value={joinUrl}
          size={244}
          level="H"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#0b0914"
          title="Código QR para ingresar al modo fiesta"
        />
      </div>

      <p className="party-qr-help">Apunta la cámara del celular al código. La sala se abrirá automáticamente y sólo será necesario confirmar el nombre.</p>
    </ModalShell>
  );
}

export default PartyQrModal;
