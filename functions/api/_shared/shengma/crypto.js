import { createCipheriv, constants, publicEncrypt } from 'node:crypto';
import { SHENGMA_RSA_PUBLIC_KEY } from './constants.js';

const AES_KEY_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomAesKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let key = '';
  for (const byte of bytes) {
    key += AES_KEY_CHARS[byte % AES_KEY_CHARS.length];
  }
  return key;
}

export function encryptLoginPassword(password) {
  const aesKey = randomAesKey();
  const cipher = createCipheriv('aes-128-ecb', Buffer.from(aesKey, 'utf8'), '');
  cipher.setAutoPadding(true);

  const encryptedPassword = Buffer.concat([
    cipher.update(String(password || ''), 'utf8'),
    cipher.final()
  ]).toString('base64');

  const encryptAesKey = publicEncrypt({
    key: SHENGMA_RSA_PUBLIC_KEY,
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(aesKey, 'utf8')).toString('base64');

  return {
    password: encryptedPassword,
    encryptAesKey
  };
}
