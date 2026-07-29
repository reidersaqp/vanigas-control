import { NextResponse } from "next/server";
import { hasGoogleDriveToken } from "../../../../lib/google-drive-oauth";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ connected: hasGoogleDriveToken() });
  } catch (err: any) {
    return NextResponse.json(
      { connected: false, error: err?.message || "No se pudo verificar Google Drive." },
      { status: 500 }
    );
  }
}
