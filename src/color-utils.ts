export type ParsedColor = { hex: string; opacity: number };
export function parseColor(value: unknown): ParsedColor | undefined {
  if (typeof value !== 'string') return;
  if (value === 'transparent') return { hex: '#000000', opacity: 0 };
  const hex = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex) return { hex: `#${hex[1].toLowerCase()}`, opacity: hex[2] ? parseInt(hex[2], 16) / 255 * 100 : 100 };
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?|\.\d+))?\s*\)$/i);
  if (!rgb) return;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some(channel => channel > 255)) return;
  return { hex: '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join(''), opacity: Number(rgb[4] ?? 1) * 100 };
}
export function colorWithOpacity(hex: string, opacity: number): string {
  const alpha = Math.max(0, Math.min(100, opacity));
  if (alpha === 100) return hex;
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${channels.join(', ')}, ${Number((alpha / 100).toFixed(3))})`;
}
export function hsvToHex(hue: number, saturation: number, value: number): string {
  const chroma = value * saturation, x = chroma * (1 - Math.abs(hue / 60 % 2 - 1)), m = value - chroma;
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return '#' + channels.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}
export function hexToHsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = !delta ? 0 : max === r ? 60 * ((g - b) / delta % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { hue: (hue + 360) % 360, saturation: max ? delta / max : 0, brightness: max };
}
