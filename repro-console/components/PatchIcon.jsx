const SHAPES = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" /></>,
  inbox: <><path d="M4 5.5h16v13H4z" /><path d="M4 14h4l1.5 2h5L16 14h4" /><path d="m8 9 4 3 4-3" /></>,
  swarm: <><circle cx="12" cy="7" r="3" /><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M10 9.5 7.5 14M14 9.5l2.5 4.5M8.5 17h7" /></>,
  play: <><path d="m9 6 9 6-9 6z" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.8 8.2-2.5 5.1-5.1 2.5 2.5-5.1z" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
  browser: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18" /><path d="M7 6.5h.01M10 6.5h.01" /></>,
  activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  verified: <><path d="M12 3 19 6v5c0 4.4-2.9 7.8-7 10-4.1-2.2-7-5.6-7-10V6z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>,
  shield: <><path d="M12 3 19 6v5c0 4.4-2.9 7.8-7 10-4.1-2.2-7-5.6-7-10V6z" /><path d="M9 12h6" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></>,
  arrowRight: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
  arrowDown: <><path d="m6 9 6 6 6-6" /></>,
  arrowUpRight: <><path d="M7 17 17 7M8 7h9v9" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></>,
  alert: <><path d="M12 3 2.8 19h18.4z" /><path d="M12 9v4M12 16.5h.01" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>,
  sliders: <><path d="M4 7h8M16 7h4M4 17h4M12 17h8" /><circle cx="14" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.1.9-1.2 2.1-1.4-.5a7.7 7.7 0 0 1-1.7 1l-.3 1.5h-2.4l-.3-1.5a7.7 7.7 0 0 1-1.7-1l-1.4.5L7 16l1.1-.9a7.5 7.5 0 0 1 0-2l-1.1-.9 1.2-2.1 1.4.5a7.7 7.7 0 0 1 1.7-1l.3-1.5H14l.3 1.5a7.7 7.7 0 0 1 1.7 1l1.4-.5 1.2 2.1-1.1.9a7.5 7.5 0 0 1-.1 1.9z" /></>,
  logout: <><path d="M10 17 15 12 10 7M15 12H3" /><path d="M12 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" /></>,
  github: <><path d="M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.7a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C5.1 1.2 3.9 1.6 3.9 1.6a4.8 4.8 0 0 0-.1 3.6 5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.1 6.4 6.1 6.7a3.4 3.4 0 0 0-.9 2.6V22" /></>,
};

export default function PatchIcon({ name, size = 18, ...props }) {
  const content = SHAPES[name] || SHAPES.overview;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {content}
    </svg>
  );
}
