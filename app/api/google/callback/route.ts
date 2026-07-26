import { NextResponse } from "next/server";
import { getGoogleOAuthClient, saveGoogleDriveToken } from "../../../../lib/google-drive-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new NextResponse("Google no devolvió código de autorización.", { status: 400 });
  }

  const auth = getGoogleOAuthClient();
  const { tokens } = await auth.getToken(code);
  saveGoogleDriveToken(tokens);

  return new NextResponse(
    `<!doctype html>
    <html lang="es">
      <head><meta charset="utf-8"><title>Google Drive conectado</title></head>
      <body style="font-family: system-ui, sans-serif; padding: 32px;">
        <h1>Google Drive conectado correctamente</h1>
        <p>Ya puedes volver a VANIGAS y presionar “Guardar Copia en Google Drive”.</p>
        <p><a href="/?view=Reportes">Volver al sistema</a></p>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
