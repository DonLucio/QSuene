function ToastContainer({ toasts, onDismiss }) {
  return (
    <div id="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <button
          type="button"
          key={toast.id}
          className={`toast ${toast.type} show`}
          onClick={() => onDismiss(toast.id)}
          title="Cerrar notificación"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export default ToastContainer;
