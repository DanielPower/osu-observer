import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import {
  S3_ACCESS_KEY_ID,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
  S3_REGION,
  S3_SECRET_ACCESS_KEY,
  S3_SESSION_TOKEN,
} from "../env";

const client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  forcePathStyle: S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    sessionToken: S3_SESSION_TOKEN,
  },
});

const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".osu": "text/plain; charset=utf-8",
  ".osr": "application/octet-stream",
  ".osk": "application/octet-stream",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export function mediaContentType(key: string): string {
  const extensionIndex = key.lastIndexOf(".");
  const extension = extensionIndex < 0 ? "" : key.slice(extensionIndex).toLowerCase();
  return MIME[extension] ?? "application/octet-stream";
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    (error.name === "NoSuchKey" ||
      error.name === "NotFound" ||
      error.$metadata.httpStatusCode === 404)
  );
}

export async function putMediaObject(
  key: string,
  body: Uint8Array,
  contentType?: string,
): Promise<void> {
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    throw new Error(`Failed to upload media object: ${key}`, { cause: error });
  }
}

export async function readMediaObject(key: string): Promise<Uint8Array | null> {
  try {
    const object = await client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      }),
    );
    return object.Body ? object.Body.transformToByteArray() : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw new Error(`Failed to read media object: ${key}`, { cause: error });
  }
}

export async function clearMediaPrefix(prefix: string): Promise<void> {
  const clearPage = async (continuationToken?: string): Promise<void> => {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const objects = page.Contents?.flatMap(({ Key }) => (Key ? [{ Key }] : [])) ?? [];
    if (objects.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: S3_BUCKET,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
    }
    if (page.NextContinuationToken) await clearPage(page.NextContinuationToken);
  };

  try {
    await clearPage();
  } catch (error) {
    throw new Error(`Failed to clear media prefix: ${prefix}`, { cause: error });
  }
}
