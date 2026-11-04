export interface SavedScript { id:string; name:string; source:string; updatedAt:string }
export const libraryKey = 'deplyze.pine.library.v1';
export function readLibrary(storage:Pick<Storage,'getItem'>):SavedScript[] {
  const raw = storage.getItem(libraryKey);
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.scripts) || data.scripts.length > 100) throw new Error('Invalid Pine library.');
  const ids = new Set<string>();
  for (const script of data.scripts) {
    if (!script || typeof script.id !== 'string' || !script.id || ids.has(script.id) || typeof script.name !== 'string' || !script.name.trim() || typeof script.source !== 'string' || new TextEncoder().encode(script.source).length > 262144 || typeof script.updatedAt !== 'string') throw new Error('Invalid saved Pine script.');
    ids.add(script.id);
  }
  return data.scripts;
}
export function writeLibrary(storage:Pick<Storage,'setItem'>,scripts:SavedScript[]) {
  if (scripts.length > 100) throw new Error('The library supports up to 100 scripts.');
  storage.setItem(libraryKey,JSON.stringify({version:1,scripts}));
}
