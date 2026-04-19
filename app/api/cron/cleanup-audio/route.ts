import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "audio-files";
const SAMPLE_OBJECT = "sample.ogg";
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function collectObjectPaths(folderPath: string): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folderPath, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.length) {
      break;
    }

    for (const item of data) {
      const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;
      if (item.id) {
        paths.push(itemPath);
      } else {
        paths.push(...(await collectObjectPaths(itemPath)));
      }
    }

    if (data.length < LIST_PAGE_SIZE) {
      break;
    }
    offset += LIST_PAGE_SIZE;
  }

  return paths;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const samplePath = join(process.cwd(), "public", SAMPLE_OBJECT);
    const sampleBytes = await readFile(samplePath);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(SAMPLE_OBJECT, sampleBytes, {
        contentType: "audio/ogg",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const paths = (await collectObjectPaths("")).filter((p) => p !== SAMPLE_OBJECT);
    let removed = 0;

    for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
      const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) {
        throw new Error(error.message);
      }
      removed += batch.length;
    }

    return NextResponse.json({ ok: true, removed, uploaded: SAMPLE_OBJECT });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
