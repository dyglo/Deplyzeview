export type AppTheme = 'dark' | 'light';
export function themeAppearance(theme: AppTheme) {
  const light = theme === 'light';
  const background = light ? '#ffffff' : '#101114';
  const text = light ? '#454850' : '#a3a5ab';
  const border = light ? '#d9dde4' : '#2a2b30';
  return {
    layout: { background, textColor: text },
    grid: { vertLines: { color: light ? '#e4e7ec' : '#181a20' }, horzLines: { color: light ? '#e4e7ec' : '#181a20' } },
    panes: { separatorColor: border },
    priceScale: { borderColor: border },
    crosshair: { color: light ? '#697180' : '#9598a1', labelBackground: light ? '#596170' : '#60646e' },
  };
}
