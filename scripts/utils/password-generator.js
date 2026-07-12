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

    const range = 0x1_0000_0000;
    const limit = range - (range % charset.length);
    const randomValues = new Uint32Array(Math.max(16, config.length * 2));
    let password = '';

    while (password.length < config.length) {
      crypto.getRandomValues(randomValues);

      for (const value of randomValues) {
        if (value >= limit) continue;
        password += charset[value % charset.length];
        if (password.length === config.length) break;
      }
    }

    randomValues.fill(0);
    return password;
  }
}
