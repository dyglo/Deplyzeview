function isVisible(element: Element) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
}

function drawDomText(root: HTMLElement, canvas: HTMLCanvasElement, scale: number) {
  const rootRect = root.getBoundingClientRect();
  const context = canvas.getContext('2d');
  if (!context) return;

  for (const element of Array.from(root.querySelectorAll<HTMLElement>('.vela-statusline *'))) {
    if (!isVisible(element)) continue;
    const directText = Array.from(element.childNodes)
      .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!directText) continue;

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const x = (rect.left - rootRect.left + Number.parseFloat(style.paddingLeft || '0')) * scale;
    const y = (rect.top - rootRect.top + rect.height / 2) * scale;
    const fontSize = Math.max(1, Number.parseFloat(style.fontSize || '10')) * scale;
    const fontWeight = style.fontWeight || '400';
    const fontFamily = style.fontFamily || 'sans-serif';
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    context.fillStyle = style.color || '#c7c9ce';
    context.textBaseline = 'middle';
    context.textAlign = style.textAlign === 'right' ? 'right' : style.textAlign === 'center' ? 'center' : 'left';
    const maxWidth = rect.width * scale;
    context.save();
    context.beginPath();
    context.rect((rect.left - rootRect.left) * scale, (rect.top - rootRect.top) * scale, rect.width * scale, rect.height * scale);
    context.clip();
    context.fillText(directText, x, y, maxWidth);
    context.restore();
  }
}

type RendererCanvasSource = { canvasPile?: () => Array<HTMLCanvasElement | null | undefined> };

export async function captureChartPng(source: HTMLElement, scale = 2.5, renderer?: RendererCanvasSource): Promise<Blob> {
  const width = Math.max(1, source.clientWidth);
  const height = Math.max(1, source.clientHeight);
  const pixelRatio = Math.max(1, Math.min(4, scale));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas capture is unavailable');

  const background = getComputedStyle(source).backgroundColor;
  context.fillStyle = background && background !== 'rgba(0, 0, 0, 0)' ? background : '#101114';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const sourceRect = source.getBoundingClientRect();
  const rendererLayers = renderer?.canvasPile?.()?.filter((layer): layer is HTMLCanvasElement => layer instanceof HTMLCanvasElement) ?? [];
  const layers = rendererLayers.length > 0 ? rendererLayers : Array.from(source.querySelectorAll<HTMLCanvasElement>('canvas'));
  for (const layer of layers) {
    if (!isVisible(layer)) continue;
    const rect = layer.getBoundingClientRect();
    const x = (rect.left - sourceRect.left) * pixelRatio;
    const y = (rect.top - sourceRect.top) * pixelRatio;
    context.drawImage(layer, x, y, rect.width * pixelRatio, rect.height * pixelRatio);
  }

  // Vela keeps the chart header as DOM text above the renderer canvases.
  drawDomText(source, canvas, pixelRatio);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
  });
}
