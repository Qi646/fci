"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { auxiliaryNav, operationalViews } from "../lib/views";

function buildHref(
  href: string,
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
) {
  const params = new URLSearchParams();
  const profile = searchParams.get("profile");
  const purpose = searchParams.get("purpose");

  if (profile) {
    params.set("profile", profile);
  }
  if (purpose) {
    params.set("purpose", purpose);
  }

  const query = params.toString();
  const target = query ? `${href}?${query}` : href;
  const isActive = pathname === href;
  return { target, isActive };
}

export default function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="appSidebar" aria-label="Application">
      <section className="navSection">
        <p className="navSectionLabel">Operational views</p>
        <div className="navList">
          {operationalViews.map((view) => {
            const { target, isActive } = buildHref(view.href, pathname, searchParams);
            return (
              <Link key={view.id} href={target} className={`sidebarLink${isActive ? " active" : ""}`}>
                <span className="sidebarLinkLabel">{view.navLabel}</span>
                <span className="sidebarLinkMeta">{view.viewType}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="navSection">
        <p className="navSectionLabel">Platform</p>
        <div className="navList">
          {auxiliaryNav.map((item) => {
            const { target, isActive } = buildHref(item.href, pathname, searchParams);
            return (
              <Link key={item.href} href={target} className={`sidebarLink${isActive ? " active" : ""}`}>
                <span className="sidebarLinkLabel">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
