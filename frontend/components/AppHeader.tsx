"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { accessProfiles } from "../lib/api";
import {
  AccessProfileKey,
  departmentLabel,
  getDefaultProfileForPath,
  normalizeProfileKey,
  normalizePurpose,
  purposeLabel,
} from "../lib/viewer";

const profileEntries = Object.entries(accessProfiles) as Array<[AccessProfileKey, (typeof accessProfiles)[AccessProfileKey]]>;

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultProfileKey = getDefaultProfileForPath(pathname);
  const profileKey = normalizeProfileKey(searchParams.get("profile") ?? undefined, defaultProfileKey);
  const profile = accessProfiles[profileKey];
  const purpose = normalizePurpose(profile, searchParams.get("purpose") ?? undefined);

  function updateQuery(nextProfileKey: AccessProfileKey, nextPurpose: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("profile", nextProfileKey);
    nextParams.set("purpose", nextPurpose);
    router.replace(`${pathname}?${nextParams.toString()}`);
  }

  function buildHref(href: string) {
    const params = new URLSearchParams();
    params.set("profile", profileKey);
    params.set("purpose", purpose);
    return `${href}?${params.toString()}`;
  }

  return (
    <header className="appHeader">
      <div className="appHeaderInner">
        <div className="appBrandBlock">
          <p className="appBrandEyebrow">Municipal operations console</p>
          <Link href={buildHref("/")} className="appBrand">
            Data Infrastructure
          </Link>
        </div>

        <div className="appAccessBar" aria-label="Active access context">
          <label className="headerField">
            <span>Viewer</span>
            <select
              value={profileKey}
              onChange={(event) => {
                const nextProfileKey = event.target.value as AccessProfileKey;
                const nextProfile = accessProfiles[nextProfileKey];
                const nextPurpose = normalizePurpose(nextProfile, nextProfile.purpose);
                updateQuery(nextProfileKey, nextPurpose);
              }}
            >
              {profileEntries.map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="headerField">
            <span>Purpose</span>
            <select
              value={purpose}
              onChange={(event) => updateQuery(profileKey, event.target.value)}
            >
              {(profile.approvedPurposes ?? []).map((approvedPurpose) => (
                <option key={approvedPurpose} value={approvedPurpose}>
                  {purposeLabel(approvedPurpose)}
                </option>
              ))}
            </select>
          </label>

          <div className="appAccessContext">
            <span className="accessChip strong">{departmentLabel(profile.department)}</span>
            <span className="accessChip">{purposeLabel(purpose)}</span>
            <span className="accessChip">{departmentLabel(profile.role)}</span>
            <span className="accessChip">Audit logged</span>
          </div>
        </div>
      </div>
    </header>
  );
}
