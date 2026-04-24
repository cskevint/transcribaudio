import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type RecordPayload = {
  familyName: string;
  reflection: string;
  contact?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<RecordPayload>;
    const familyName = body.familyName?.trim() ?? "";
    const reflection = body.reflection?.trim() ?? "";
    const contact = body.contact?.trim() ?? "";

    if (!familyName || !reflection) {
      return NextResponse.json(
        { error: "familyName and reflection are required" },
        { status: 400 },
      );
    }

    const content: RecordPayload = {
      familyName,
      reflection,
      ...(contact ? { contact } : {}),
    };

    const { error } = await supabase.from("records").insert({ content });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
