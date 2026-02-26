export type Stage1ManifestTarget = {
  id?: string;
  name?: string;
  url?: string;
  meta?: Record<string, unknown>;
};

export type Stage1ManifestJob = {
  id?: string;
  name?: string;
  status?: string;
  meta?: Record<string, unknown>;
};

export type Stage1ManifestArtifact = {
  id?: string;
  path?: string;
  type?: string;
  kind?: string;
  name?: string;
  role?: string;
  format?: string;
  meta?: Record<string, unknown>;
};

export type Stage1Manifest = {
  contractVersion?: string;
  bundleVersion?: string;
  toolVersion?: string;
  generatedAt?: string;
  projectId?: string;
  project_id?: string;
  mode?: string;
  targets?: Stage1ManifestTarget[];
  jobs?: Stage1ManifestJob[];
  artifacts?: Stage1ManifestArtifact[];
};

export type Stage1BundleArtifactPayload = {
  id?: string;
  path?: string;
  type?: string;
  kind?: string;
  name?: string;
  role?: string;
  data?: unknown;
  payload?: unknown;
  content?: unknown;
};

export type Stage1BundlePayload = {
  manifest: Stage1Manifest;
  artifacts?: Stage1BundleArtifactPayload[] | Record<string, unknown>;
  evidence?: Record<string, unknown>;
  synthesis?: Record<string, unknown>;
  tokenGuess?: unknown;
  tokenSuggestions?: unknown;
  styleFingerprint?: unknown;
  components?: unknown;
};

export type Stage1BundleInput = Stage1BundlePayload | string;

export type Stage1ComponentClusterSelectors = {
  css?: string;
  testId?: string;
  role?: string;
};

export type Stage1ComponentClusterEntry = {
  name: string;
  count: number;
  confidence: number;
  selectors: Stage1ComponentClusterSelectors;
  parent_cluster: string | null;
  variants: string[];
};

export type Stage1TokenGuessArtifact = {
  kind: "token_guess";
  version: string;
  generated_at?: string;
  tokens: Record<string, string>;
};

export type Stage1ComponentClustersArtifact = {
  kind: "component_clusters";
  version: string;
  generated_at?: string;
  clusters: Stage1ComponentClusterEntry[];
};

export type Stage1Component = {
  id?: string;
  name: string;
  count?: number;
  source?: string;
  confidence?: number;
  selectors?: Stage1ComponentClusterSelectors;
  parentCluster?: string | null;
  variants?: string[];
};

export type Stage1BundleLoadResult = {
  ok: boolean;
  componentCount: number;
  tokenSuggestionCount: number;
  components: Stage1Component[];
  tokenSuggestions: Record<string, string>;
  errors: string[];
};

export type Stage1TokenSeedResult = {
  appliedCount: number;
  invalidPaths: string[];
  resolvedAt: string;
};
