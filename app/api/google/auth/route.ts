import { NextResponse } from "next/server";
import { getGoogleOAuthClient, GOOGLE_DRIVE_SCOPES } from "../../../../lib/google-drive-oauth";

export const runtime = "nodejs";

export async function GET() {
  const auth = getGoogleOAuthClient();
  const url = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_DRIVE_SCOPES,
  });

  return NextResponse.redirect(url);
}
