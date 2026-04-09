'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const LANGUAGES = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'English', value: 'en' },
  { label: 'English (US)', value: 'en_us' },
  { label: 'English (UK)', value: 'en_uk' },
  { label: 'English (Australia)', value: 'en_au' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Korean', value: 'ko' },
  { label: 'Polish', value: 'pl' },
  { label: 'Russian', value: 'ru' },
  { label: 'Turkish', value: 'tr' },
  { label: 'Ukrainian', value: 'uk' },
  { label: 'Vietnamese', value: 'vi' },
  { label: 'Finnish', value: 'fi' },
]

type Status = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export default function Home() {
  const [language, setLanguage] = useState('auto')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) setFile(selected)
  }

  const handleSubmit = async () => {
    if (!file) return

    setStatus('uploading')
    setTranscript('')
    setError('')

    try {
      // 1. Get a signed upload URL from our API (uses service role key server-side)
      const urlRes = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      })

      if (!urlRes.ok) {
        const body = await urlRes.json()
        throw new Error(body.error ?? 'Failed to get upload URL')
      }

      const { token, path } = await urlRes.json()

      // 2. Upload directly to Supabase using the signed URL
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .uploadToSignedUrl(path, token, file, { contentType: file.type })

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

      // 3. Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('audio-files')
        .getPublicUrl(path)

      // 4. Submit for transcription
      setStatus('processing')

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: publicUrl, languageCode: language }),
      })

      if (!transcribeRes.ok) {
        const body = await transcribeRes.json()
        throw new Error(body.error ?? 'Failed to submit transcription')
      }

      const { transcriptId } = await transcribeRes.json()

      // 5. Poll for completion
      const poll = async () => {
        const res = await fetch(`/api/transcription/${transcriptId}`)
        const data = await res.json()

        if (data.status === 'completed') {
          setTranscript(data.text ?? '')
          setStatus('done')
        } else if (data.status === 'error') {
          throw new Error(data.error ?? 'Transcription failed')
        } else {
          pollRef.current = setTimeout(poll, 3000)
        }
      }

      await poll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    setFile(null)
    setStatus('idle')
    setTranscript('')
    setError('')
    setCopied(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isLoading = status === 'uploading' || status === 'processing'

  return (
    <main className="min-h-screen bg-slate-50 flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">TranscribAudio</h1>
          <p className="text-slate-500 mt-2 text-sm">Upload an audio file and get a transcript powered by AssemblyAI</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* File drop zone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Audio File
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isLoading && fileInputRef.current?.click()}
              className={[
                'border-2 border-dashed rounded-xl p-10 text-center transition-colors',
                isDragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                onChange={handleFileChange}
                className="hidden"
                disabled={isLoading}
              />

              {file ? (
                <div>
                  <div className="flex items-center justify-center mb-2">
                    <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <p className="text-slate-900 font-medium text-sm">{file.name}</p>
                  <p className="text-slate-400 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-center mb-3">
                    <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-slate-600 font-medium text-sm">Drop an audio file here</p>
                  <p className="text-slate-400 text-xs mt-1">or click to browse</p>
                  <p className="text-slate-400 text-xs mt-2">MP3, MP4, WAV, M4A, FLAC, and more</p>
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!file || isLoading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
          >
            {status === 'uploading'
              ? 'Uploading...'
              : status === 'processing'
              ? 'Transcribing...'
              : 'Transcribe'}
          </button>

          {/* Loading status */}
          {isLoading && (
            <div className="flex items-center gap-2.5 text-sm text-slate-500">
              <svg className="animate-spin h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {status === 'uploading'
                ? 'Uploading audio to storage...'
                : 'Processing transcription — this may take a moment for longer files...'}
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm font-medium">Something went wrong</p>
              <p className="text-red-600 text-sm mt-0.5">{error}</p>
              <button
                onClick={reset}
                className="text-red-600 text-sm font-medium mt-3 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Transcript output */}
          {status === 'done' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">Transcript</label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleCopy}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={reset}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    New file
                  </button>
                </div>
              </div>
              <textarea
                readOnly
                value={transcript}
                rows={12}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm resize-y focus:outline-none leading-relaxed"
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
