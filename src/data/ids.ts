/**
 * Row identifiers.
 *
 * Deliberately not `expo-crypto`: a UUID here would cost another native module
 * and therefore another development build, to identify rows in a single-user
 * local database. Time prefix plus randomness is unique enough for that, and
 * sorts roughly by creation as a side benefit. These ids are never secrets and
 * never leave the device.
 */
export function newId(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${time}-${random}`;
}
