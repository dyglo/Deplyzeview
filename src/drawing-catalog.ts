import { defaultToolbar, drawingTypes, type DrawingTypeKey } from '@luxalgo/vela';
import { isCustomDrawingType } from './custom-drawing-tools.ts';

const customGroupTargets: Record<string, string> = {
  lines: 'lines-channels-pitchforks', patterns: 'patterns-waves-harmonics', measure: 'measurements',
  shapes: 'brushes-arrows-shapes', annotations: 'text'
};
const customTools = drawingTypes().filter(tool => isCustomDrawingType(tool.type));
export const drawingGroups = defaultToolbar().groups.map(group => ({
  ...group,
  tools: [...group.tools, ...customTools.filter(tool => customGroupTargets[tool.group] === group.id && !group.tools.some(existing => existing.type === tool.type))
    .map(tool => ({ type: tool.type as DrawingTypeKey, label: tool.label, icon: tool.icon }))],
  sections: [...(group.sections ?? []), ...customTools.filter(tool => customGroupTargets[tool.group] === group.id && !group.tools.some(existing => existing.type === tool.type))
    .map(tool => ({ label: 'Custom', tools: [{ type: tool.type as DrawingTypeKey, label: tool.label, icon: tool.icon }] }))]
}));
export const drawingCatalog = new Map(drawingGroups.flatMap(group => group.tools.map(tool => [tool.type, tool] as const)));
export type DrawingToolPreferences = {
  favorites: DrawingTypeKey[];
  visible: boolean;
  position: { x: number; y: number };
  lastUsed: Record<string, DrawingTypeKey>;
};
export function defaultDrawingTools(): DrawingToolPreferences {
  return { favorites: [], visible: true, position: { x: .5, y: .08 }, lastUsed: {} };
}
const fraction = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
export function readDrawingTools(value: unknown): DrawingToolPreferences {
  const defaults = defaultDrawingTools();
  if (!value || typeof value !== 'object') return defaults;
  const saved = value as Record<string, unknown>;
  const position = saved.position && typeof saved.position === 'object' ? saved.position as Record<string, unknown> : {};
  const lastUsed = saved.lastUsed && typeof saved.lastUsed === 'object' ? saved.lastUsed as Record<string, unknown> : {};
  const favorites = Array.isArray(saved.favorites) ? [...new Set(saved.favorites.filter((type): type is DrawingTypeKey => typeof type === 'string' && drawingCatalog.has(type as DrawingTypeKey)))] : [];
  return {
    favorites, visible: typeof saved.visible === 'boolean' ? saved.visible : true,
    position: { x: fraction(position.x, defaults.position.x), y: fraction(position.y, defaults.position.y) },
    lastUsed: Object.fromEntries(drawingGroups.flatMap(group => group.tools.some(tool => tool.type === lastUsed[group.id]) ? [[group.id, lastUsed[group.id] as DrawingTypeKey]] : [])),
  };
}
export function groupTool(group: typeof drawingGroups[number], preferences: DrawingToolPreferences) {
  return group.tools.find(tool => tool.type === preferences.lastUsed[group.id]) ?? group.tools[0];
}
export function clampToolbarPosition(x: number, y: number, areaWidth: number, areaHeight: number, barWidth: number, barHeight: number) {
  const availableX = Math.max(0, areaWidth - barWidth - 16), availableY = Math.max(0, areaHeight - barHeight - 16);
  return { left: 8 + Math.max(0, Math.min(1, x)) * availableX, top: 8 + Math.max(0, Math.min(1, y)) * availableY };
}
