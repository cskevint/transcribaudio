"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useLocale, buildLanguageOptions, MAX_FILE_SIZE_MB, type Locale } from "@/lib/i18n";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Status = "idle" | "uploading" | "processing" | "done" | "error";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Home() {
  const { locale, setLocale, t } = useLocale();
  const [language, setLanguage] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const recorded = new File([blob], `recording-${Date.now()}.${ext}`, { type: mimeType });
        setFile(recorded);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setFile(null);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      setError("Microphone access denied or unavailable");
      setStatus("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setStatus("uploading");
    setTranscript("");
    setError("");

    try {
      // 1. Get a signed upload URL from our API (uses service role key server-side)
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });

      if (!urlRes.ok) {
        const body = await urlRes.json();
        throw new Error(body.error ?? "Failed to get upload URL");
      }

      const { token, path } = await urlRes.json();

      // 2. Upload directly to Supabase using the signed URL
      const { error: uploadError } = await supabase.storage
        .from("audio-files")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // 3. Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("audio-files").getPublicUrl(path);

      // 4. Submit for transcription
      setStatus("processing");

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: publicUrl, languageCode: language }),
      });

      if (!transcribeRes.ok) {
        const body = await transcribeRes.json();
        throw new Error(body.error ?? "Failed to submit transcription");
      }

      const { transcriptId } = await transcribeRes.json();

      // 5. Poll for completion
      const poll = async () => {
        const res = await fetch(`/api/transcription/${transcriptId}`);
        const data = await res.json();

        if (data.status === "completed") {
          setTranscript(data.text ?? "");
          setStatus("done");
        } else if (data.status === "error") {
          throw new Error(data.error ?? "Transcription failed");
        } else {
          pollRef.current = setTimeout(poll, 3000);
        }
      };

      await poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setFile(null);
    setStatus("idle");
    setTranscript("");
    setError("");
    setCopied(false);
    setIsRecording(false);
    setRecordingTime(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isLoading = status === "uploading" || status === "processing";

  return (
    <main className="min-h-screen bg-slate-50 flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">TranscribAudio</h1>
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(["en", "es"] as Locale[]).map((l, i) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className={[
                    "px-2.5 py-1 transition-colors",
                    i === 0 ? "" : "border-l border-slate-200",
                    locale === l ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <p className="text-slate-500 mt-2 text-sm">{t.subtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
          {/* Language */}
          {!isLoading && status !== "done" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.languageLabel}
              </label>
              {(() => {
                const { autoDetect, featured, others } = buildLanguageOptions(locale, t);
                return (
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value={autoDetect.value}>{autoDetect.label}</option>
                    {featured.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                    <option disabled>────────────────</option>
                    {others.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </div>
          )}

          {/* File drop zone */}
          {!isLoading && status !== "done" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.audioFileLabel}
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isLoading && !isRecording && fileInputRef.current?.click()}
                className={[
                  "border-2 border-dashed rounded-xl p-10 text-center transition-colors",
                  isDragging
                    ? "border-blue-400 bg-blue-50"
                    : file && !isRecording && !isLoading
                      ? "border-green-300 bg-green-50 hover:border-green-400 hover:bg-green-100"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                  isLoading || isRecording ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isLoading || isRecording}
                />

                {file && !isRecording ? (
                  <div>
                    <div className="flex items-center justify-center mb-2">
                      <svg
                        className="w-8 h-8 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                        />
                      </svg>
                    </div>
                    <p className="text-slate-900 font-medium text-sm">{file.name}</p>
                    <p className="text-slate-400 text-xs mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-center mb-3">
                      <svg
                        className="w-10 h-10 text-slate-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                    <p className="text-slate-600 font-medium text-sm">{t.dropPrompt}</p>
                    <p className="text-slate-400 text-xs mt-1">{t.dropBrowse}</p>
                    <p className="text-slate-400 text-xs mt-2">{t.dropFormats}</p>
                    <p className="text-slate-400 text-xs mt-1">
                      {t.upTo} {MAX_FILE_SIZE_MB} MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Record section */}
          {!isLoading && status !== "done" && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">{t.orRecord}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {isRecording ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 flex-1 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-red-700 text-sm font-medium">{t.recording}</span>
                    <span className="text-red-500 text-sm font-mono ml-auto">
                      {formatTime(recordingTime)}
                    </span>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium rounded-lg transition-colors text-sm shrink-0"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                    {t.stop}
                  </button>
                </div>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-medium rounded-lg transition-colors text-sm"
                >
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm0 2a2 2 0 00-2 2v6a2 2 0 004 0V5a2 2 0 00-2-2zm-7 9a7 7 0 0014 0h2a9 9 0 01-8 8.94V23h-2v-2.06A9 9 0 013 12H5z" />
                  </svg>
                  {t.recordButton}
                </button>
              )}
            </>
          )}

          {/* Submit / New audio */}
          {status === "done" ? (
            <button
              onClick={reset}
              className="w-full py-2.5 px-4 font-medium rounded-lg transition-colors text-sm border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {t.newFile}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!file || isLoading || isRecording}
              className={[
                "w-full py-2.5 px-4 text-white font-medium rounded-lg transition-colors text-sm",
                file && !isLoading && !isRecording
                  ? "bg-green-600 hover:bg-green-700 active:bg-green-800"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800",
                "disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {status === "uploading"
                ? t.uploading
                : status === "processing"
                  ? t.transcribing
                  : t.transcribe}
            </button>
          )}

          {/* Loading status */}
          {isLoading && (
            <div className="flex items-center gap-2.5 text-sm text-slate-500">
              <svg
                className="animate-spin h-4 w-4 text-blue-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {status === "uploading" ? t.uploadingStatus : t.processingStatus}
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm font-medium">{t.errorTitle}</p>
              <p className="text-red-600 text-sm mt-0.5">{error}</p>
              <button
                onClick={reset}
                className="text-red-600 text-sm font-medium mt-3 hover:underline"
              >
                {t.tryAgain}
              </button>
            </div>
          )}

          {/* Transcript output */}
          {status === "done" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-base font-semibold text-slate-800">
                  {t.transcriptLabel}
                </label>
                <button
                  onClick={handleCopy}
                  className={[
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    copied
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white",
                  ].join(" ")}
                >
                  {copied ? (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {t.copied}
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      {t.copy}
                    </>
                  )}
                </button>
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
  );
}
