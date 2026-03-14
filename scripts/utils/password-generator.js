export class PasswordGenerator {
  static generate(options = {}) {
    const defaults = {
      length: 16,
      numbers: true,
      symbols: true,
      uppercase: true,
      lowercase: true
    };

    const config = { ...defaults, ...options };

    const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
    const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numberChars   = '0123456789';
    const symbolChars   = '!@#$%^&*()-_=+[]{}<>?/';

    let charset = '';
    if (config.lowercase) charset += lowercaseChars;
    if (config.uppercase) charset += uppercaseChars;
    if (config.numbers) charset += numberChars;
    if (config.symbols) charset += symbolChars;

    if (charset.length === 0) {
      throw new Error('Aucun caractère autorisé pour la génération.');
    }

    const array = new Uint32Array(config.length);
    crypto.getRandomValues(array);

    return Array.from(array, x => charset[x % charset.length]).join('');
  }
}
