const emojiPattern =
  /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu;

export const stripEmojis = (text: string): string => {
  return text
    .replace(emojiPattern, "")
    .replace(/  +/g, " ")
    .replace(/^ +/gm, "")
    .replace(/ +$/gm, "");
};
