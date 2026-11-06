import { NextRequest, NextResponse } from 'next/server'

export function verifyCronSecret(req: NextRequest): NextResponse | null {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
