/**
 * Copy text to clipboard with fallback for mobile / non-HTTPS contexts.
 * navigator.clipboard requires a secure context (HTTPS or localhost).
 * On plain HTTP over LAN, we fall back to the classic textarea + execCommand approach.
 */
export async function copyToClipboard(text) {
  // Try modern API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fall through to fallback
    }
  }

  // Fallback: hidden textarea + execCommand
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand('copy');
    return true;
  } catch (e) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
