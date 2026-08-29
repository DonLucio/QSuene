const KEY = 'que-suene-party-pending-wishlist'

export function loadPendingWishlistRequests() {
  try {
    const entries = JSON.parse(window.localStorage.getItem(KEY) || '[]')
    return new Map(Array.isArray(entries) ? entries : [])
  } catch { return new Map() }
}

export function persistPendingWishlistRequests(requests) {
  window.localStorage.setItem(KEY, JSON.stringify([...requests.entries()]))
}

export function normalizeSongText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}
