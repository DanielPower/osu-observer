// Builds a URL for an object in the media bucket. Each path segment is percent-encoded, because
// beatmap filenames can contain characters such as # and ? that would otherwise end the path.
export const mediaUrl = (base: string, path: string) =>
  `${base}/${path.split("/").map(encodeURIComponent).join("/")}`;
