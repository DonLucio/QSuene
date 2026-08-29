export const PARTY_CONTRACT_VERSION = 1;

export function partyPayload(payload = {}) {
  return { contract_version: PARTY_CONTRACT_VERSION, ...payload };
}
