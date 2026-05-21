export const X_POST_CHARACTER_LIMIT = 280;

export function isOverXCharacterLimit(text: string): boolean {
  return text.length > X_POST_CHARACTER_LIMIT;
}
