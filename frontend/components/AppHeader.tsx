import Link from "next/link";

const links = [
  { href: "/", label: "Views" },
  { href: "/access", label: "Access" },
];

export default function AppHeader() {
  return (
    <header className="appHeader">
      <div className="appHeaderInner">
        <div className="appBrandBlock">
          <p className="appBrandEyebrow">Municipal Operations Console</p>
          <Link href="/" className="appBrand">
            Data Infrastructure
          </Link>
        </div>
        <nav className="appNav" aria-label="Primary">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="appNavLink">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
