type TokenObject = Record<string, unknown>;

export type ThemeVariantMap = Record<string, TokenObject>;

const THEME_CONTAINER_KEYS = ["themes", "themeVariants"] as const;

const isRecord = (value: unknown): value is TokenObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeThemeVariants = (value: unknown): ThemeVariantMap => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<ThemeVariantMap>((acc, [name, tokens]) => {
    if (!isRecord(tokens)) {
      return acc;
    }
    acc[name] = tokens;
    return acc;
  }, {});
};

export const flattenToTokenPaths = (
  obj: TokenObject,
  prefix = ""
): Record<string, string> => {
  const paths: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      Object.assign(paths, flattenToTokenPaths(value, path));
    } else {
      paths[path] = String(value);
    }
  }
  return paths;
};

export const tokenPathToCssVarName = (path: string): string =>
  `--${path.replaceAll(".", "-")}`;

export const tokenPathToScssVarName = (path: string): string =>
  `$${path.replaceAll(".", "-")}`;

export const sanitizeCssComment = (value: string): string =>
  value.replaceAll("*/", "* /").replace(/\s+/g, " ").trim();

export const sortTokenEntries = (
  tokenPaths: Record<string, string>
): [string, string][] =>
  Object.entries(tokenPaths).sort(([a], [b]) => a.localeCompare(b));

export const resolveAnnotation = (
  annotations: Record<string, string>,
  path: string,
  themeName?: string
): string | undefined => {
  if (!themeName) {
    return annotations[path];
  }

  return (
    annotations[`themes.${themeName}.${path}`] ??
    annotations[`themeVariants.${themeName}.${path}`] ??
    annotations[`${themeName}.${path}`] ??
    annotations[path]
  );
};

export const extractThemeVariants = (
  tokens: TokenObject,
  explicitThemeVariants?: ThemeVariantMap
): { baseTokens: TokenObject; themeVariants: ThemeVariantMap } => {
  if (explicitThemeVariants) {
    return {
      baseTokens: { ...tokens },
      themeVariants: normalizeThemeVariants(explicitThemeVariants),
    };
  }

  const baseTokens: TokenObject = { ...tokens };
  const themeVariants = THEME_CONTAINER_KEYS.reduce<ThemeVariantMap>(
    (acc, key) => ({
      ...acc,
      ...normalizeThemeVariants(tokens[key]),
    }),
    {}
  );

  for (const key of THEME_CONTAINER_KEYS) {
    delete baseTokens[key];
  }

  return { baseTokens, themeVariants };
};
