import { NextRequest, NextResponse } from 'next/server'
import { AssemblyAI } from 'assemblyai'

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })

export async function POST(req: NextRequest) {
  const { audioUrl, languageCode } = await req.json()

  const params =
    languageCode === 'auto'
      ? { audio_url: audioUrl as string, language_detection: true as const, speech_models: ['universal-2'] as const }
      : { audio_url: audioUrl as string, language_code: languageCode as string, speech_models: ['universal-2'] as const }

  const transcript = await client.transcripts.submit(params)

  return NextResponse.json({ transcriptId: transcript.id })
}
