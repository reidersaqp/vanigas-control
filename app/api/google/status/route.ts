import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const TOKEN_PATH =
  process.env.GOOGLE_OAUTH_TOKEN_PATH ||
  path.join("C:\\Users\\Renzo\\Downloads", "vanigas-google-drive-token.json");

export async function GET() {
  try {
    const connected = Boolean(
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN ||
      process.env.GOOGLE_OAUTH_TOKEN_JSON ||
      fs.existsSync(TOKEN_PATH)
    );

    return NextResponse.json({ connected });
  } catch (err: any) {
    return NextResponse.json(
      { connected: false, error: err?.message || "No se pudo verificar Google Drive." },
      { status: 500 }
    );
  }
}
