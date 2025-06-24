import { createCanvas } from 'canvas';

export default async function handler(req, res) {
  // Accept up to 30 comma-separated close prices
  const pts = (req.query.prices ?? '')
                .split(',')
                .map(Number)
                .filter(Boolean)
                .slice(-30);

  // Fallback to flat line if bad input
  if (!pts.length) pts.push(1, 1);

  const w = 72, h = 72;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');

  ctx.lineWidth = 3;
  const rising = pts.at(-1) >= pts[0];
  ctx.strokeStyle = rising ? '#00e676' : '#ff5252';

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const normY = y => h - ((y - min) / (max - min || 1)) * (h - 10) - 5;

  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = (i / (pts.length - 1)) * (w - 10) + 5;
    const y = normY(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();

  res.setHeader('Content-Type', 'image/png');
  c.pngStream().pipe(res);
} 