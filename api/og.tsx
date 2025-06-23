// This file should be named og.tsx for JSX support
import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prompt = (searchParams.get('prompt') || '').slice(0, 90);
  const chartUrl = searchParams.get('chart');
  const summary = searchParams.get('summary') || '• Yield: 14% APY\n• Risk: delta-neutral';
  const user = searchParams.get('user') || '@anon';
  const refUrl = 'https://fere.ai/demo?ref=' + encodeURIComponent(user);

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: '#0F0F12',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, margin: '40px 60px 0 60px', color: '#00FFD1' }}>
        {prompt}
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', margin: '0 60px' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {chartUrl ? (
            <img src={chartUrl} width={300} height={200} style={{ borderRadius: 16 }} />
          ) : (
            <span style={{ fontSize: 120 }}>📈</span>
          )}
        </div>
        <div style={{ flex: 1, fontSize: 32, whiteSpace: 'pre-line', paddingLeft: 40 }}>
          {summary}
        </div>
      </div>
      <div style={{
        height: 60,
        background: '#18181C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 60px',
        fontSize: 24,
      }}>
        <span>{user}</span>
        <span>Powered by Fere <img src="https://fere.ai/logo.png" width={32} style={{ verticalAlign: 'middle' }} /></span>
        <span>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(refUrl)}`} width={40} />
          <span style={{ marginLeft: 8 }}>{refUrl}</span>
        </span>
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
} 