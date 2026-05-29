import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function parseJson<T>(
  request: NextRequest,
  schema: z.ZodType<T>
): Promise<{ data: T } | { response: NextResponse }> {
  let raw: unknown

  try {
    raw = await request.json()
  } catch {
    return {
      response: NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      ),
    }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_REQUEST_BODY' },
        { status: 400 }
      ),
    }
  }

  return { data: parsed.data }
}

