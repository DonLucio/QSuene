import { useCallback, useRef, useState } from 'react';

export default function useToast() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = nextId.current++;
    setToasts(current => [...current, { id, message, type }]);
    window.setTimeout(() => dismissToast(id), 3400);
  }, [dismissToast]);

  return { toasts, showToast, dismissToast };
}
