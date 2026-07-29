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

type GoogleTokens = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

function getOAuthConfig() {
  const envClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const envClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/api/google/callback",
    };
  }

  if (!fs.existsSync(OAUTH_CREDENTIALS_PATH)) {
    throw new Error("No se encontr? el JSON OAuth de Google. En Vercel configura GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET.");
  }

  const credentials = JSON.parse(fs.readFileSync(OAUTH_CREDENTIALS_PATH, "utf8")) as OAuthCredentials;
  const config = credentials.web || credentials.installed;

  if (!config?.client_id || !config.client_secret) {
    throw new Error("El JSON de Google no es un cliente OAuth v?lido.");
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

function getTokenFromEnv(): GoogleTokens | null {
  if (process.env.GOOGLE_OAUTH_TOKEN_JSON) {
    return JSON.parse(process.env.GOOGLE_OAUTH_TOKEN_JSON) as GoogleTokens;
  }

  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return {
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      token_type: "Bearer",
      scope: GOOGLE_DRIVE_SCOPES.join(" "),
    };
  }

  return null;
}

function getTokenFromFile(): GoogleTokens | null {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")) as GoogleTokens;
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
  return Boolean(getTokenFromEnv() || getTokenFromFile());
}

export function saveGoogleDriveToken(tokens: GoogleTokens) {
  const existing = getTokenFromFile() || getTokenFromEnv() || {};
  const merged = { ...existing, ...tokens };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export function getGoogleDriveToken() {
  const token = getTokenFromEnv() || getTokenFromFile();

  if (!token) {
    throw new Error("Google Drive no est? conectado. En localhost autoriza Google; en Vercel configura GOOGLE_OAUTH_REFRESH_TOKEN.");
  }

  return token;
}

export function getAuthorizedGoogleOAuthClient() {
  const auth = getGoogleOAuthClient();
  auth.setCredentials(getGoogleDriveToken());
  return auth;
}
