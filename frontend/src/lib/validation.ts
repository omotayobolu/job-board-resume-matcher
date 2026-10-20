export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

/** react-hook-form `validate` rule: returns true when valid, otherwise the message. */
export function validateEmail(value: string): true | string {
  const email = value.trim();
  if (!email) return "Enter your email.";
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  return true;
}
