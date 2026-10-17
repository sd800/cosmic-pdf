// Reader-local choices; changing them never writes the default Settings appearance.
export const isAppearanceMode = value => ['auto','light','dark'].includes(value);
export function resolveReaderAppearance(defaultMode, override, systemDark) {
  const fallback = isAppearanceMode(defaultMode) ? defaultMode : 'auto';
  const base = fallback === 'dark' || (fallback === 'auto' && !!systemDark);
  if (override === 'opposite') return {dark:!base, mode:base ? 'light' : 'dark'};
  const mode = isAppearanceMode(override) ? override : fallback;
  return {dark:mode === 'dark' || (mode === 'auto' && !!systemDark), mode};
}
export function toggleReaderAppearance(defaultMode, override, systemDark) {
  if (override === null || override === 'opposite') return override === null ? 'opposite' : null;
  return resolveReaderAppearance(defaultMode, override, systemDark).dark ? 'light' : 'dark';
}
