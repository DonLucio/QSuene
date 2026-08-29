export const CONTRACT_VERSION = 1

export function versioned(payload = {}) {
  return { contract_version: CONTRACT_VERSION, ...payload }
}

export function validEnvelope(envelope) {
  return Boolean(envelope && typeof envelope === 'object' && 'data' in envelope)
}
