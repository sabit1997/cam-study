import CryptoJS from "crypto-js";

const secret = process.env.NEXT_PUBLIC_USER_ID_SECRET!;

export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, secret).toString();
}

export function decrypt(cipherText: string): string {
  const bytes = CryptoJS.AES.decrypt(cipherText, secret);
  return bytes.toString(CryptoJS.enc.Utf8);
}
