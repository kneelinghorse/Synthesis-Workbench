export type FragmentIsolationMode =
  | "none"
  | "isolated"
  | "global-failure"
  | "unknown";

export type FragmentContractExpectation = {
  expectedNodeIds?: string[];
  acceptedIsolationModes?: FragmentIsolationMode[];
  expectedStrict?: boolean;
  requireFragmentFormat?: boolean;
};

export type FragmentContractCheck = {
  id: string;
  pass: boolean;
  detail: string;
};

export type FragmentContractSummary = {
  status: string | null;
  format: string | null;
  strict: boolean | null;
  fragmentKeys: string[];
  errorCount: number;
  errorNodeIds: string[];
  isolationMode: FragmentIsolationMode;
  hasDocumentWrappers: boolean;
};

export type FragmentContractResult = {
  pass: boolean;
  checks: FragmentContractCheck[];
  summary: FragmentContractSummary;
};

type ParsedFragment = {
  key: string;
  nodeId: string | null;
  component: string | null;
  html: string | null;
  cssRefs: string[];
};

type ParsedError = {
  nodeId: string | null;
  path: string | null;
};

const DEFAULT_ACCEPTED_ISOLATION_MODES: FragmentIsolationMode[] = [
  "none",
  "isolated",
  "global-failure",
];

const DOCUMENT_WRAPPER_RE = /<!doctype|<html\b|<head\b|<body\b/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toStringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const parseFragments = (
  value: unknown,
): { fragments: ParsedFragment[]; malformedKeys: string[] } => {
  if (!isRecord(value)) {
    return { fragments: [], malformedKeys: [] };
  }

  const fragments: ParsedFragment[] = [];
  const malformedKeys: string[] = [];

  for (const [key, rawFragment] of Object.entries(value)) {
    if (!isRecord(rawFragment)) {
      malformedKeys.push(key);
      continue;
    }

    const fragment: ParsedFragment = {
      key,
      nodeId: toStringValue(rawFragment.nodeId),
      component: toStringValue(rawFragment.component),
      html: toStringValue(rawFragment.html),
      cssRefs: toStringArray(rawFragment.cssRefs),
    };

    if (!fragment.nodeId || !fragment.component || !fragment.html) {
      malformedKeys.push(key);
      continue;
    }

    fragments.push(fragment);
  }

  return { fragments, malformedKeys };
};

const parseErrors = (value: unknown): ParsedError[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      return { nodeId: null, path: null };
    }
    return {
      nodeId: toStringValue(entry.nodeId),
      path: toStringValue(entry.path),
    };
  });
};

const toErrorNodeId = (error: ParsedError): string | null => {
  if (error.nodeId) {
    return error.nodeId;
  }

  if (!error.path) {
    return null;
  }

  const match = error.path.match(/^\/fragments\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }
  return match[1] ?? null;
};

const classifyIsolationMode = (
  status: string | null,
  fragmentCount: number,
  errors: ParsedError[],
): FragmentIsolationMode => {
  const errorCount = errors.length;
  if (errorCount === 0) {
    return fragmentCount > 0 ? "none" : "unknown";
  }

  const fragmentScopedErrors = errors.every((entry) => {
    const nodeId = toErrorNodeId(entry);
    return Boolean(nodeId);
  });

  if (status === "ok" && fragmentCount > 0 && fragmentScopedErrors) {
    return "isolated";
  }

  if (status === "error" && fragmentCount === 0) {
    return "global-failure";
  }

  return "unknown";
};

const createCheck = (
  id: string,
  pass: boolean,
  detail: string,
): FragmentContractCheck => ({
  id,
  pass,
  detail,
});

export const evaluateFoundryFragmentContract = (
  payload: unknown,
  expectation: FragmentContractExpectation = {},
): FragmentContractResult => {
  const checks: FragmentContractCheck[] = [];

  if (!isRecord(payload)) {
    const summary: FragmentContractSummary = {
      status: null,
      format: null,
      strict: null,
      fragmentKeys: [],
      errorCount: 0,
      errorNodeIds: [],
      isolationMode: "unknown",
      hasDocumentWrappers: false,
    };

    checks.push(
      createCheck(
        "payload.record",
        false,
        "Foundry response payload must be an object.",
      ),
    );

    return {
      pass: false,
      checks,
      summary,
    };
  }

  const status = toStringValue(payload.status);
  const output = isRecord(payload.output) ? payload.output : null;
  const format = output ? toStringValue(output.format) : null;
  const strict =
    output && typeof output.strict === "boolean" ? output.strict : null;

  const { fragments, malformedKeys } = parseFragments(payload.fragments);
  const errors = parseErrors(payload.errors);
  const errorNodeIds = errors
    .map((entry) => toErrorNodeId(entry))
    .filter((entry): entry is string => Boolean(entry));

  const fragmentKeys = fragments.map((entry) => entry.key);
  const isolationMode = classifyIsolationMode(status, fragments.length, errors);
  const hasDocumentWrappers = fragments.some((entry) =>
    DOCUMENT_WRAPPER_RE.test(entry.html ?? ""),
  );

  checks.push(
    createCheck(
      "payload.record",
      true,
      "Foundry response payload is an object.",
    ),
  );

  const requireFragmentFormat = expectation.requireFragmentFormat ?? true;
  if (requireFragmentFormat) {
    checks.push(
      createCheck(
        "output.format.fragments",
        format === "fragments",
        format === "fragments"
          ? "output.format is fragments."
          : `Expected output.format="fragments" but received "${format ?? "missing"}".`,
      ),
    );
  }

  checks.push(
    createCheck(
      "fragments.shape",
      malformedKeys.length === 0,
      malformedKeys.length === 0
        ? `All ${fragments.length} fragment entries include key fields (nodeId/component/html).`
        : `Malformed fragment entries: ${malformedKeys.join(", ")}.`,
    ),
  );

  const deterministicIds = fragments.every((entry) => entry.nodeId === entry.key);
  checks.push(
    createCheck(
      "fragments.deterministic-ids",
      deterministicIds,
      deterministicIds
        ? "Each fragment key matches fragment.nodeId."
        : "At least one fragment key does not match fragment.nodeId.",
    ),
  );

  checks.push(
    createCheck(
      "fragments.no-document-wrappers",
      !hasDocumentWrappers,
      !hasDocumentWrappers
        ? "No fragment HTML entry contains document wrapper tags."
        : "Fragment HTML contains document wrapper tags (doctype/html/head/body).",
    ),
  );

  const css = isRecord(payload.css) ? payload.css : null;
  const unresolvedCssRefs = fragments.flatMap((entry) =>
    entry.cssRefs.filter((cssRef) => !css || !(cssRef in css)),
  );
  checks.push(
    createCheck(
      "fragments.css-refs-resolve",
      unresolvedCssRefs.length === 0,
      unresolvedCssRefs.length === 0
        ? "All fragment cssRefs resolve to keys in response.css."
        : `Unresolved cssRefs: ${Array.from(new Set(unresolvedCssRefs)).join(", ")}.`,
    ),
  );

  const expectedNodeIds = expectation.expectedNodeIds ?? [];
  if (expectedNodeIds.length > 0) {
    const coveredNodeIds = new Set<string>([...fragmentKeys, ...errorNodeIds]);
    const missingNodeIds = expectedNodeIds.filter((id) => !coveredNodeIds.has(id));
    checks.push(
      createCheck(
        "coverage.node-ids",
        missingNodeIds.length === 0,
        missingNodeIds.length === 0
          ? "Every expected nodeId appears in fragments or scoped errors."
          : `Missing expected nodeIds in fragments/errors: ${missingNodeIds.join(", ")}.`,
      ),
    );
  }

  if (typeof expectation.expectedStrict === "boolean") {
    checks.push(
      createCheck(
        "output.strict",
        strict === expectation.expectedStrict,
        strict === expectation.expectedStrict
          ? `output.strict matches expected value (${expectation.expectedStrict}).`
          : `Expected output.strict=${expectation.expectedStrict} but received ${strict ?? "missing"}.`,
      ),
    );
  }

  const acceptedIsolationModes =
    expectation.acceptedIsolationModes ?? DEFAULT_ACCEPTED_ISOLATION_MODES;
  checks.push(
    createCheck(
      "errors.isolation-mode",
      acceptedIsolationModes.includes(isolationMode),
      acceptedIsolationModes.includes(isolationMode)
        ? `Observed isolation mode "${isolationMode}" is accepted.`
        : `Observed isolation mode "${isolationMode}" is not accepted (${acceptedIsolationModes.join(", ")}).`,
    ),
  );

  const summary: FragmentContractSummary = {
    status,
    format,
    strict,
    fragmentKeys,
    errorCount: errors.length,
    errorNodeIds,
    isolationMode,
    hasDocumentWrappers,
  };

  return {
    pass: checks.every((check) => check.pass),
    checks,
    summary,
  };
};
