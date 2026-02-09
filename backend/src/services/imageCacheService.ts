import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import { config } from "../config";

type CacheStatus = "unknown" | "available" | "unavailable";

let cacheStatus: CacheStatus = "unknown";
let cachedBucket: ReturnType<Storage["bucket"]> | null = null;
let bucketPromise: Promise<ReturnType<Storage["bucket"]> | null> | null = null;

const parseDurationMs = (value: string | undefined, fallbackMs: number) => {
  if (!value) {
    return fallbackMs;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(s)?$/);
  if (!match) {
    return fallbackMs;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return fallbackMs;
  }
  return amount * 1000;
};

const getStorageBucket = async () => {
  if (!config.imageCacheEnabled) {
    return null;
  }
  if (cacheStatus === "unavailable") {
    return null;
  }
  if (cachedBucket) {
    return cachedBucket;
  }
  if (bucketPromise) {
    return bucketPromise;
  }
  if (!config.gcloudProjectId || !config.gcloudClientEmail || !config.gcloudPrivateKey) {
    cacheStatus = "unavailable";
    return null;
  }
  if (!config.gcloudBucket) {
    cacheStatus = "unavailable";
    return null;
  }

  bucketPromise = (async () => {
    try {
      const storage = new Storage({
        projectId: config.gcloudProjectId,
        credentials: {
          client_email: config.gcloudClientEmail,
          private_key: config.gcloudPrivateKey,
        },
      });
      const bucket = storage.bucket(config.gcloudBucket);
      const [exists] = await bucket.exists();
      if (!exists) {
        console.warn(
          `[ImageCache] GCS bucket not found: ${config.gcloudBucket}. Image cache disabled.`,
        );
        cacheStatus = "unavailable";
        return null;
      }
      cacheStatus = "available";
      cachedBucket = bucket;
      return bucket;
    } catch (error) {
      console.warn("[ImageCache] GCS initialization failed, cache disabled:", error);
      cacheStatus = "unavailable";
      return null;
    } finally {
      bucketPromise = null;
    }
  })();

  return bucketPromise;
};

const hashPrompt = (prompt: string) =>
  crypto.createHash("sha256").update(prompt).digest("hex");

const getCacheFile = async (prompt: string) => {
  const bucket = await getStorageBucket();
  if (!bucket) {
    return null;
  }
  const hash = hashPrompt(prompt);
  return bucket.file(`prompt-cache/${hash}.png`);
};

const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return { contentType: match[1], data: match[2] };
};

export const getCachedImageUrl = async (prompt: string): Promise<string | null> => {
  const file = await getCacheFile(prompt);
  if (!file) {
    return null;
  }
  try {
    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }
    const ttlMs = parseDurationMs(config.gcloudSignedUrlTtl, 3600_000);
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + ttlMs,
    });
    return url;
  } catch (error) {
    console.warn("[ImageCache] GCS cache read failed:", error);
    return null;
  }
};

export const storeImageInCache = async (prompt: string, imageUrl: string) => {
  const file = await getCacheFile(prompt);
  if (!file) {
    return;
  }
  const parsed = parseDataUrl(imageUrl);
  if (!parsed) {
    return;
  }
  try {
    const [exists] = await file.exists();
    if (exists) {
      return;
    }
    const buffer = Buffer.from(parsed.data, "base64");
    await file.save(buffer, {
      contentType: parsed.contentType,
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
    console.log("[ImageCache] Cached image stored in GCS");
  } catch (error) {
    console.warn("[ImageCache] GCS cache write failed:", error);
  }
};
