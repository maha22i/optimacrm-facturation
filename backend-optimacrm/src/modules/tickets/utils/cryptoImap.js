import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Récupère la clé de chiffrement depuis EMAIL_ENCRYPTION_KEY (32 octets en hex).
 * Fail fast : throw si absente ou invalide — on ne stocke jamais en clair.
 */
export function getEncryptionKey() {
  const hex = process.env.EMAIL_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      '[EMAIL-INGEST] EMAIL_ENCRYPTION_KEY manquante. Générez-la avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('[EMAIL-INGEST] EMAIL_ENCRYPTION_KEY invalide : 32 octets en hexadécimal attendus (64 caractères)');
  }
  return key;
}

/**
 * Chiffre une chaîne en AES-256-GCM.
 * @returns {string} payload au format "iv:authTag:ciphertext" (hex)
 */
export function encrypt(plain) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Déchiffre un payload "iv:authTag:ciphertext" (hex) en clair.
 */
export function decrypt(payload) {
  const key = getEncryptionKey();
  const parts = String(payload).split(':');
  if (parts.length !== 3) {
    throw new Error('[EMAIL-INGEST] Payload chiffré invalide (format attendu iv:authTag:ciphertext)');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return plain.toString('utf8');
}
