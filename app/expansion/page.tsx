"use client";

import { FormEvent, useState } from "react";

export default function ExpansionPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      familyName: String(form.get("familyName") ?? "").trim(),
      reflection: String(form.get("reflection") ?? "").trim(),
      contact: String(form.get("contact") ?? "").trim(),
    };

    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar el formulario.");

      setSubmitted(true);
      e.currentTarget.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ocurrio un error al enviar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Expansion</h1>
        <p className="mt-2 text-sm text-slate-600">Completa el formulario y envialo.</p>

        {submitted ? (
          <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            Gracias por enviar su informacion.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="familyName" className="mb-2 block text-sm font-medium text-slate-800">
                Nombre de familia o nucleo:
              </label>
              <input
                id="familyName"
                name="familyName"
                type="text"
                required
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Escribe tu respuesta"
              />
            </div>

            <div>
              <label htmlFor="reflection" className="mb-2 block text-sm font-medium text-slate-800">
                Reflexion sobre su esfuerzo:
              </label>
              <textarea
                id="reflection"
                name="reflection"
                required
                rows={5}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Comparte tu reflexion"
              />
            </div>

            <div>
              <p className="mb-2 block text-sm font-medium text-slate-800">
                Metodo de contacto (opcional):
              </p>
              <input
                id="contact"
                name="contact"
                type="text"
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Telefono o email"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:bg-blue-800"
            >
              {isSubmitting ? "Enviando..." : "Submit"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
