type DownloadFileOptions = {
  content: string;
  filename: string;
  mimeType: string;
};

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  json: "application/json",
  yaml: "text/yaml",
  css: "text/css",
  scss: "text/x-scss",
  spec: "application/json",
};

const EXTENSIONS: Record<string, string> = {
  html: ".html",
  json: ".json",
  yaml: ".design.yaml",
  css: ".css",
  scss: ".scss",
  spec: ".spec.json",
};

export const getMimeType = (format: string): string =>
  MIME_TYPES[format] ?? "text/plain";

export const getFilename = (slug: string, format: string): string =>
  `${slug}${EXTENSIONS[format] ?? `.${format}`}`;

export const downloadFile = ({
  content,
  filename,
  mimeType,
}: DownloadFileOptions): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const copyToClipboard = async (content: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
};
