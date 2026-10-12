const VIDEO_EXT = /\.(mp4|mov|webm|avi|m4v|ogg)(\?.*)?$/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXT.test(url.split("#")[0]);
}

/** Still frame saved beside a video as `{name}.poster.jpg`. */
export function posterUrl(url: string): string {
  if (!isVideoUrl(url)) return url;
  return url.replace(VIDEO_EXT, ".poster.jpg$2");
}

/** URL safe to put in an <img>. Videos use their generated poster. */
export function displayImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  return isVideoUrl(url) ? posterUrl(url) : url;
}
