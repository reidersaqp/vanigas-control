import fs from "fs";
import path from "path";
import { google } from "googleapis";

const OAUTH_CREDENTIALS_PATH =
  process.env.GOOGLE_OAUTH_CREDENTIALS ||
  "C:\\Users\\Renzo\\Downloads\\client_secret_785597903723-rdrvc5hp9gtrhd4l4ab63utt3g8rf9u4.apps.googleusercontent.com.json";

const TOKEN_PATH =
  process.env.GOOGLE_OAUTH_TOKEN_PATH ||
  path.join("C:\\Users\\Renzo\\Downloads", "vanigas-google-drive-token.json");

export const GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

type OAuthCredentials = {
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
};

function getOAuthConfig() {
  if (!fs.existsSync(OAUTH_CREDENTIALS_PATH)) {
    throw new Error("No se encontró el JSON OAuth de Google en Descargas.");
  }

  const credentials = JSON.parse(fs.readFileSync(OAUTH_CREDENTIALS_PATH, "utf8")) as OAuthCredentials;
  const config = credentials.web || credentials.installed;

  if (!config?.client_id || !config.client_secret) {
    throw new Error("El JSON de Google no es un cliente OAuth válido.");
  }

  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    config.redirect_uris?.find((uri) => uri.includes("localhost:3000")) ||
    "http://localhost:3000/api/google/callback";

  return {
    clientId: config.client_id,
    clientSecret: config.client_secret,
    redirectUri,
  };
}

export function getGoogleOAuthClient() {
  const config = getOAuthConfig();

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

export function hasGoogleDriveToken() {
  return fs.existsSync(TOKEN_PATH);
}

export function saveGoogleDriveToken(tokens: unknown) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

export function getAuthorizedGoogleOAuthClient() {
  const auth = getGoogleOAuthClient();

  if (!hasGoogleDriveToken()) {
    throw new Error("Google Drive no está conectado. Primero autoriza tu cuenta Google.");
  }

  auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
  return auth;
}
