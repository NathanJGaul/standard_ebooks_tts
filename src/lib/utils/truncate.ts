export default function truncate(text: string, length = 100) {
  return text && text.length > length
    ? text.substring(0, length) + "..."
    : text;
}
