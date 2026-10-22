import { DEFAULT_SETTINGS, sanitizeSettings } from '../core/matching.js';

const KEY = 'jobscoutSettings';
// Previous key is read once so an in-place rebrand keeps existing preferences.
const LEGACY_KEY = 'rolenexaSettings';

export async function loadSettings() {
  const payload = await chrome.storage.local.get([KEY, LEGACY_KEY]);
  const value = payload[KEY] ?? payload[LEGACY_KEY] ?? DEFAULT_SETTINGS;
  if (payload[KEY] === undefined && payload[LEGACY_KEY] !== undefined) {
    await chrome.storage.local.set({ [KEY]: value });
  }
  if (payload[LEGACY_KEY] !== undefined) await chrome.storage.local.remove(LEGACY_KEY);
  return sanitizeSettings(value);
}

export async function saveSettings(settings) {
  const sanitized = sanitizeSettings(settings);
  await chrome.storage.local.set({ [KEY]: sanitized });
  return sanitized;
}

export async function restrictStorage() {
  // También se invoca en la inicialización, nunca exponemos storage a content scripts.
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
