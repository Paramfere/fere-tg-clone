import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  return new Response('pong', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
} 