const forge = require('node-forge/lib/forge');
require('node-forge/lib/rsa');
require('node-forge/lib/sha256');

forge.options.usePureJavaScript = true;

function decode(s) {
  return forge.util.decode64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
}

exports.verify = (signed, signature, modulus) => {
  try {
    if (typeof modulus !== 'string' || !/^[A-Za-z0-9_-]{342,683}$/.test(modulus)) return false;
    const n = new forge.jsbn.BigInteger(forge.util.bytesToHex(decode(modulus)), 16);
    if (n.bitLength() < 2048 || n.bitLength() > 4096) return false;
    const sig = decode(signature);
    if (sig.length !== Math.ceil(n.bitLength() / 8) || new forge.jsbn.BigInteger(forge.util.bytesToHex(sig), 16).compareTo(n) >= 0) return false;
    const key = forge.pki.rsa.setPublicKey(n, new forge.jsbn.BigInteger('65537', 10));
    const digest = forge.md.sha256.create().update(signed).digest().bytes();
    return key.verify(digest, sig);
  } catch (_) { return false; }
};
