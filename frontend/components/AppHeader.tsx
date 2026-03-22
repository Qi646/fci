import Link from "next/link";

const links = [
  { href: "/", label: "Views" },
  { href: "/access", label: "Access" },
];

export default function AppHeader() {
  return (
    <header className="appHeader">
      <div className="appHeaderInner">
        <Link href="/" className="appBrand">
          Municipal Data Infrastructure
        </Link>
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
