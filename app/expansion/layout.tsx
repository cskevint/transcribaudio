import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reflexiones",
  description:
    "Comparte reflexiones familiares por voz o texto y envia tu informacion de forma sencilla.",
  openGraph: {
    title: "Reflexiones",
    description:
      "Una pagina para grabar o escribir reflexiones, completar campos automaticamente y enviar el formulario.",
    type: "website",
    url: "/expansion",
    images: [
      {
        url: "/header.png",
        width: 1200,
        height: 630,
        alt: "Reflexiones",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reflexiones",
    description:
      "Graba o escribe reflexiones individuales o familiares, revisa el contenido y envialo facilmente.",
    images: ["/header.png"],
  },
};

export default function ExpansionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
