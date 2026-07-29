import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    let connected = Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_TOKEN_JSON);

    if (!connected && !process.env.VERCEL) {
      const [{ existsSync }, { join }] = await Promise.all([import("fs"), import("path")]);
      const tokenPath =
        process.env.GOOGLE_OAUTH_TOKEN_PATH ||
        join("C:\\Users\\Renzo\\Downloads", "vanigas-google-drive-token.json");
      connected = existsSync(tokenPath);
    }

    return NextResponse.json({ connected });
  } catch (err: any) {
    return NextResponse.json(
      { connected: false, error: err?.message || "No se pudo verificar Google Drive." },
      { status: 500 }
    );
  }
}
