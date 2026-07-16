// Returns the urls of blobs strictly older than `now - maxAgeMs`. A blob
// exactly at the threshold is NOT considered stale.
export function selectStaleBlobs(
  blobs: Array<{ url: string; uploadedAt: Date }>,
  now: Date,
  maxAgeMs: number
): string[] {
  const cutoff = now.getTime() - maxAgeMs;
  return blobs
    .filter((blob) => blob.uploadedAt.getTime() < cutoff)
    .map((blob) => blob.url);
}
