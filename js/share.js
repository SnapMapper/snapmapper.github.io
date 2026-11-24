// Hand a file to the iOS share sheet where supported, else download it. Nothing here touches
// the network: the share sheet and downloads are local OS actions.

export function canShareFiles() {
  try {
    const probe = new File(['x'], 'probe.txt', { type: 'text/plain' });
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Must be called straight from a tap handler (Safari only allows share() during a user
 * gesture), so build the file synchronously before calling.
 * Returns 'shared', 'downloaded' or 'cancelled'.
 */
export async function shareOrDownload(bytes, filename, type, { forceDownload = false } = {}) {
  const blob = new Blob([bytes], { type });
  if (!forceDownload) {
    const file = new File([blob], filename, { type });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
        // Other failures (e.g. lost user activation): fall through to a download.
      }
    }
  }
  download(blob, filename);
  return 'downloaded';
}
