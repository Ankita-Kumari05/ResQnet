// Central configuration for ResQnet SMS Emergency Fallback

/**
 * The emergency dispatch phone number of the ResQnet Tricity EOC / State Disaster Authority.
 * Configurable via Vite environment variable VITE_COORDINATOR_SMS_NUMBER.
 * Defaults to the official Chandigarh Tricity EOC emergency dispatch line: +91 172-274-0112 / +91 9814189021.
 */
export const COORDINATOR_SMS_NUMBER =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COORDINATOR_SMS_NUMBER) ||
  '+919814189021'

/**
 * Validates whether a coordinator SMS recipient phone number is configured and structurally valid.
 */
export function isCoordinatorSmsConfigured(): boolean {
  if (!COORDINATOR_SMS_NUMBER) return false
  const cleaned = COORDINATOR_SMS_NUMBER.replace(/[\s-]/g, '')
  // Valid international or domestic number format with at least 8 digits
  return /^\+?[0-9]{8,15}$/.test(cleaned)
}

/**
 * Returns the cleaned, dialable coordinator SMS recipient number.
 */
export function getCoordinatorSmsNumber(): string {
  return COORDINATOR_SMS_NUMBER.replace(/[\s-]/g, '')
}

