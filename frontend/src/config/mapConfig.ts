// Central configuration for Map Engine V2
// In production on Vercel, this routes to the /map-v2 sub-path or custom VITE_MAP_V2_URL.
export const MAP_V2_URL = import.meta.env.VITE_MAP_V2_URL || (typeof window !== 'undefined' && window.location.origin ? `${window.location.origin}/map-v2` : 'http://localhost:5174');

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
