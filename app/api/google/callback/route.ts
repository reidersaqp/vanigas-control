import { NextResponse } from "next/server";
import { getGoogleOAuthClient, saveGoogleDriveToken } from "../../../../lib/google-drive-oauth";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new NextResponse("Google no devolvi? c?digo de autorizaci?n.", { status: 400 });
  }

  const auth = getGoogleOAuthClient();
  const { tokens } = await auth.getToken(code);
  let savedTokens = tokens;
  try {
    savedTokens = saveGoogleDriveToken(tokens as any) as any;
  } catch (error) {
    console.warn("No se pudo guardar token en archivo local. En Vercel se debe usar variable de entorno.", error);
  }
  const refreshToken = savedTokens.refresh_token || tokens.refresh_token || "";
  const isVercel = Boolean(process.env.VERCEL || process.env.GOOGLE_OAUTH_CLIENT_ID);

  return new NextResponse(
    `<!doctype html>
    <html lang="es">
      <head><meta charset="utf-8"><title>Google Drive conectado</title></head>
      <body style="font-family: system-ui, sans-serif; padding: 32px; color: #111827; line-height: 1.5;">
        <h1>Google Drive conectado correctamente</h1>
        <p>Ya puedes volver a VANIGAS y presionar ?Guardar copia en Google Drive?.</p>
        ${isVercel && refreshToken ? `
          <div style="margin: 24px 0; padding: 16px; border: 1px solid #d1d5db; border-radius: 10px; background: #f9fafb;">
            <h2 style="font-size: 18px; margin-top: 0;">Variable para Vercel</h2>
            <p>Copia este valor en Vercel como <b>GOOGLE_OAUTH_REFRESH_TOKEN</b>:</p>
            <textarea readonly style="width: 100%; min-height: 90px; font-family: monospace;">${escapeHtml(refreshToken)}</textarea>
          </div>
        ` : ""}
        <p><a href="/?view=Reportes">Volver al sistema</a></p>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
