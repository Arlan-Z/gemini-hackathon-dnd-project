const FALLBACK_IMAGE_URL =
  "https://placehold.co/1024x1024/png?text=AM";

export const generateImage = async (prompt: string) => {
  const safePrompt = prompt.trim().slice(0, 120);
  const encoded = encodeURIComponent(safePrompt);
  const imageUrl = safePrompt
    ? `https://placehold.co/1024x1024/png?text=${encoded}`
    : FALLBACK_IMAGE_URL;

  return { imageUrl };
};
