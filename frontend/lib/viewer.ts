import { accessProfiles, AccessContext, purposeLabels, withPurpose } from "./api";

export type AccessProfileKey = keyof typeof accessProfiles;

export type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined> | undefined>
  | Record<string, string | string[] | undefined>
  | undefined;

export type ResolvedViewer = {
  profileKey: AccessProfileKey;
  profile: AccessContext;
  context: AccessContext;
  purpose: string;
};

const defaultProfileByPath: Record<string, AccessProfileKey> = {
  "/": "publicPortal",
  "/engineering": "engineering",
  "/planning": "planning",
  "/public-health": "publicHealth",
  "/social-services": "socialServices",
  "/transit": "transit",
  "/climate": "climate",
  "/access": "admin",
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function allValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

export function departmentLabel(value: string | undefined) {
  return String(value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function shareModeLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function accessModeLabel(value: string) {
  const labels: Record<string, string> = {
    raw: "Full detail",
    aggregate_only: "Aggregate only",
    denied: "Denied",
  };
  return labels[value] ?? shareModeLabel(value);
}

export function classificationLabel(value: string) {
  return shareModeLabel(value);
}

export function purposeLabel(value: string) {
  return purposeLabels[value] ?? shareModeLabel(value);
}

export function getDefaultProfileForPath(pathname: string): AccessProfileKey {
  return defaultProfileByPath[pathname] ?? "engineering";
}

export function normalizeProfileKey(
  rawProfile: string | undefined,
  fallback: AccessProfileKey,
): AccessProfileKey {
  if (!rawProfile) {
    return fallback;
  }

  const profileKeys = Object.keys(accessProfiles) as AccessProfileKey[];
  return profileKeys.includes(rawProfile as AccessProfileKey)
    ? (rawProfile as AccessProfileKey)
    : fallback;
}

export function normalizePurpose(profile: AccessContext, rawPurpose: string | undefined) {
  const approvedPurposes = profile.approvedPurposes ?? [];
  if (rawPurpose && approvedPurposes.includes(rawPurpose)) {
    return rawPurpose;
  }
  return profile.purpose ?? approvedPurposes[0] ?? "public_information";
}

export function normalizeIncludedDatasets(
  rawInclude: string[],
  accessibleDatasetIds: string[],
  defaultIncludedIds: string[],
) {
  const allowed = new Set(accessibleDatasetIds);
  const requested = rawInclude
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => allowed.has(item));

  if (requested.length > 0) {
    return [...new Set(requested)];
  }

  return defaultIncludedIds.filter((item) => allowed.has(item));
}

export async function resolveIncludedDatasetIds(
  searchParamsInput: SearchParamsInput,
  accessibleDatasetIds: string[],
  defaultIncludedIds: string[],
) {
  const searchParams = (await searchParamsInput) ?? {};
  return normalizeIncludedDatasets(
    allValues(searchParams.include),
    accessibleDatasetIds,
    defaultIncludedIds,
  );
}

export async function resolveViewer(
  searchParamsInput: SearchParamsInput,
  fallbackProfileKey: AccessProfileKey,
): Promise<ResolvedViewer> {
  const searchParams = (await searchParamsInput) ?? {};
  const profileKey = normalizeProfileKey(firstValue(searchParams.profile), fallbackProfileKey);
  const profile = accessProfiles[profileKey];
  const purpose = normalizePurpose(profile, firstValue(searchParams.purpose));

  return {
    profileKey,
    profile,
    context: withPurpose(profile, purpose),
    purpose,
  };
}
