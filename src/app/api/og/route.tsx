import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    return new ImageResponse(
      <div
        style={{
          width: 1200,
          height: 630,
          background: '#00FFD1',
          color: '#0F0F12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
          fontSize: 64,
          border: '10px solid red',
        }}
      >
        MINIMAL OG IMAGE TEST
      </div>,
      { width: 1200, height: 630 }
    );
  } catch (e) {
    return new ImageResponse(
      <div
        style={{
          width: 1200,
          height: 630,
          background: '#FF0000',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
          fontSize: 48,
          border: '10px solid black',
        }}
      >
        ERROR: Could not render OG image.
      </div>,
      { width: 1200, height: 630 }
    );
  }
} 