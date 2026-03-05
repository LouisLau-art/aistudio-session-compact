const LOGIN_REQUIRED_MESSAGE =
  "Google sign-in required for this browser profile. Open AI Studio once in non-headless mode with the same profile, finish login, then rerun.";

export function assertAistudioSessionReady(sourceUrl: string, sampleText?: string): void {
  if (isGoogleSignInUrl(sourceUrl) || looksLikeGoogleSignInText(sampleText)) {
    throw new Error(LOGIN_REQUIRED_MESSAGE);
  }
}

function isGoogleSignInUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.hostname === "accounts.google.com";
  } catch {
    return sourceUrl.includes("accounts.google.com");
  }
}

function looksLikeGoogleSignInText(sampleText: string | undefined): boolean {
  if (!sampleText) {
    return false;
  }

  const normalized = sampleText.toLowerCase();
  return (
    normalized.includes("email or phone") &&
    normalized.includes("forgot email") &&
    normalized.includes("type the text you hear or see")
  );
}
