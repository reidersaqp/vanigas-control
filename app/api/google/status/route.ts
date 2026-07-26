import { NextResponse } from "next/server";
import { hasGoogleDriveToken } from "../../../../lib/google-drive-oauth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ connected: hasGoogleDriveToken() });
}
