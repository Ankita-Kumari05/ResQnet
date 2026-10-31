// Central configuration for Map Engine V2
export const MAP_V2_URL = 'http://localhost:5174';

/**
 * Builds a Map Engine V2 deep link with role query param and JWT token in URL fragment.
 * Format: http://localhost:5174?role=<role>#token=<encoded token>
 */
export function getMapV2Url(role: string, token?: string | null): string {
  let effectiveToken = token;
  if (!effectiveToken && typeof window !== 'undefined') {
    try {
      effectiveToken = sessionStorage.getItem('resqnet_token') || localStorage.getItem('resqnet_token');
    } catch {
      // storage unavailable
    }
  }

  const hash = effectiveToken ? `#token=${encodeURIComponent(effectiveToken)}` : '';
  return `${MAP_V2_URL}?role=${encodeURIComponent(role)}${hash}`;
}
