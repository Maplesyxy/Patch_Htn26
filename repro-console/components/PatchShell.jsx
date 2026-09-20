import PatchIcon from "@/components/PatchIcon";

const PRIMARY_LINKS = [
  ["overview", "Overview", "overview"],
  ["investigations", "Investigations", "activity"],
  ["agents", "Agent ensemble", "swarm"],
  ["about", "About Patch", "book"],
];

export function PatchMark({ size = 32, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="10" fill="#D8EEF0" />
      <g transform="rotate(-38 16 16)">
        <rect x="8" y="3.5" width="16" height="25" rx="6" fill="#173E43" />
        <rect x="11" y="10" width="10" height="12" rx="3" fill="#D8EEF0" />
        <circle cx="10.6" cy="8" r="1" fill="#D8EEF0" />
        <circle cx="21.4" cy="8" r="1" fill="#D8EEF0" />
        <circle cx="10.6" cy="24" r="1" fill="#D8EEF0" />
        <circle cx="21.4" cy="24" r="1" fill="#D8EEF0" />
        <path d="M13.6 13.5h4.8M13.6 16h4.8M13.6 18.5h4.8" stroke="#246F78" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Logo({ compact = false }) {
  return (
    <a className={"patch-brand" + (compact ? " patch-brand-compact" : "")} href="/" aria-label="Patch home">
      <PatchMark size={34} />
      <span>patch</span>
    </a>
  );
}

function NavLink({ name, label, icon, active, onNavigate, mobile = false }) {
  const href = name === "overview" ? "/" : "/?view=" + encodeURIComponent(name);
  const onClick = (event) => {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(name);
  };
  return (
    <a
      className={"patch-nav-link" + (active === name ? " is-active" : "") + (mobile ? " patch-nav-link-mobile" : "")}
      href={href}
      onClick={onClick}
      aria-current={active === name ? "page" : undefined}
    >
      <PatchIcon name={icon} size={18} />
      <span>{label}</span>
      {name === "investigations" && !mobile ? <span className="patch-nav-indicator" aria-hidden="true" /> : null}
    </a>
  );
}

function initials(name) {
  const parts = String(name || "HT").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "HT";
}

export default function PatchShell({ children, active = "overview", title = "Overview", onNavigate, onNewReport, onCodeReview, me, onSignOut }) {
  const runtimeHref = "/?view=settings";
  const settingsClick = (event) => {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate("settings");
  };

  return (
    <div className="patch-app-shell">
      <aside className="patch-sidebar">
        <Logo />
        <div className="patch-workspace-selector">
          <span className="patch-workspace-mark"><span>H</span></span>
          <span className="patch-workspace-label"><strong>Hack the North</strong><small>Workspace</small></span>
        </div>
        {onNewReport ? <button type="button" className="patch-sidebar-report" onClick={onNewReport}><PatchIcon name="plus" size={16} /><span>Report a bug</span></button> : null}
        <nav className="patch-sidebar-nav" aria-label="Workspace navigation">
          <span className="patch-nav-caption">Workspace</span>
          {PRIMARY_LINKS.map(([name, label, icon]) => (
            <NavLink key={name} name={name} label={label} icon={icon} active={active} onNavigate={onNavigate} />
          ))}
          {onCodeReview ? (
            <button type="button" className="patch-nav-link patch-nav-button" onClick={onCodeReview}>
              <PatchIcon name="code" size={18} /><span>Code review</span>
            </button>
          ) : null}
          <div className="patch-nav-divider" />
          <span className="patch-nav-caption">Configuration</span>
          <a className={"patch-nav-link patch-settings-nav" + (active === "settings" ? " is-active" : "")} href={runtimeHref} onClick={settingsClick} aria-current={active === "settings" ? "page" : undefined}>
            <PatchIcon name="settings" size={18} /><span>Runtime settings</span>
          </a>
        </nav>
        <div className="patch-sidebar-spacer" />
        <div className="patch-season-badge"><span className="patch-season-mark">H</span><span><strong>Hack the North</strong><small>2026 · Builder workspace</small></span></div>
        <div className="patch-user-card">
          <span className="patch-user-avatar">{initials(me && me.name)}</span>
          <span className="patch-user-meta"><strong>{me ? me.name : "Loading workspace"}</strong><small>{me ? me.role : "Checking access"}</small></span>
          {me && me.signInOn && onSignOut ? <button className="patch-signout" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out"><PatchIcon name="logout" size={16} /></button> : null}
        </div>
      </aside>
      <div className="patch-app-body">
        <header className="patch-topbar">
          <div className="patch-breadcrumbs" aria-label="Breadcrumb">
            <a href="/" onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate("overview"); } }}>Workspace</a>
            <span className="patch-breadcrumb-slash">/</span>
            <span>{title}</span>
          </div>
          <div className="patch-topbar-actions">
            <span className="patch-environment-badge"><i />Development</span>
            <span className="patch-topbar-divider" />
            <a className="patch-github-link" href="https://github.com/Maplesyxy/Patch_Htn26" target="_blank" rel="noreferrer"><PatchIcon name="github" size={16} /><span>GitHub</span><PatchIcon name="arrowUpRight" size={12} /></a>
          </div>
        </header>
        <nav className="patch-mobile-nav" aria-label="Workspace navigation">
          {PRIMARY_LINKS.map(([name, label, icon]) => (
            <NavLink key={name} name={name} label={label} icon={icon} active={active} onNavigate={onNavigate} mobile />
          ))}
          <NavLink name="settings" label="Settings" icon="settings" active={active} onNavigate={onNavigate} mobile />
          {onNewReport ? <button type="button" className="patch-mobile-report" onClick={onNewReport}><PatchIcon name="plus" size={14} /><span>Report a bug</span></button> : null}
        </nav>
        <main className="patch-main">
          {children}
          <footer className="patch-app-footer"><span><PatchMark size={16} /> Patch workspace</span><span>From report to verified fix <i /> Built for Hack the North 2026</span></footer>
        </main>
      </div>
    </div>
  );
}
