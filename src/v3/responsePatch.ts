const originalJson = Response.prototype.json;

Response.prototype.json = async function patchedJson() {
  const clone = this.clone();
  const text = await clone.text();
  const trimmed = text.trim();

  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
    const lower = trimmed.toLowerCase();
    if (lower.includes('accounts.google.com') || lower.includes('sign in') || lower.includes('login')) {
      throw new Error('Apps Script meminta login Google. Deployment Web App harus diatur Execute as: Me dan Who has access: Anyone.');
    }
    throw new Error('Apps Script mengembalikan halaman HTML, bukan JSON. Periksa URL Web App /exec dan deploy ulang backend Apps Script.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return originalJson.call(this);
  }
};
