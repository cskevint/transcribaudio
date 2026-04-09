import { NextRequest, NextResponse } from 'next/server'
import { AssemblyAI } from 'assemblyai'

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const transcript = await client.transcripts.get(id)

  return NextResponse.json({
    status: transcript.status,
    text: transcript.text,
    error: transcript.error,
  })
}
