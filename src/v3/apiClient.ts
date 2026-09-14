export type ApiPayload = {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
};

function htmlMessage(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('accounts.google.com') || lower.includes('sign in') || lower.includes('login')) {
    return 'Apps Script meminta login Google. Deploy Web App dengan akses Anyone agar dapat dipanggil dari aplikasi.';
  }
  if (lower.includes('script function not found') || lower.includes('doPost')) {
    return 'Deployment Apps Script tidak memiliki doPost yang aktif. Deploy ulang versi backend terbaru.';
  }
  return 'Apps Script mengembalikan halaman HTML, bukan JSON. Periksa URL /exec dan deployment Web App. Gunakan Execute as: Me dan Who has access: Anyone.';
}

export async function readApiResponse(response: Response): Promise<ApiPayload> {
  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error(`Backend tidak mengembalikan respons. HTTP ${response.status}.`);
  }

  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
    throw new Error(htmlMessage(trimmed));
  }

  try {
    const payload = JSON.parse(trimmed) as ApiPayload;
    if (!response.ok) {
      throw new Error(payload.message || `HTTP ${response.status}`);
    }
    return payload;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Respons backend bukan JSON yang valid. HTTP ${response.status}.`);
    }
    throw error;
  }
}
