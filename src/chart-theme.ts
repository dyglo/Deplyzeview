export type AppTheme = 'dark' | 'light';
export function themeAppearance(theme: AppTheme) {
  const light = theme === 'light';
  const background = light ? '#ffffff' : '#000000';
  const text = light ? '#454850' : '#b8b8b8';
  const border = light ? '#d9dde4' : '#222222';
  return {
    layout: { background, textColor: text },
    grid: { vertLines: { color: light ? '#e4e7ec' : '#141414' }, horzLines: { color: light ? '#e4e7ec' : '#141414' } },
    panes: { separatorColor: border },
    priceScale: { borderColor: border },
    crosshair: { color: light ? '#697180' : '#797979', labelBackground: light ? '#596170' : '#303030' },
  };
}
