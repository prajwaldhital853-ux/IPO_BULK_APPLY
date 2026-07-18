export class MeroshareError extends Error {
  code: 'AUTH' | 'CAPTCHA' | 'NETWORK' | 'RATE' | 'APPLY' | 'UNKNOWN';
  constructor(
    code: MeroshareError['code'],
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'MeroshareError';
  }
}
