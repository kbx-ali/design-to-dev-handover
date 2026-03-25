import { useState } from "react";

const STATUS_CONFIG = {
  existing: {
    label: "Existing Section",
    color: "bg-emerald-100 text-emerald-800 border-emerald-300",
    dot: "bg-emerald-500",
    description: "Use as-is from theme",
  },
  modified: {
    label: "Needs New Settings",
    color: "bg-amber-100 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
    description: "Existing section, new customiser settings needed",
  },
  bespoke: {
    label: "Bespoke Section",
    color: "bg-violet-100 text-violet-800 border-violet-300",
    dot: "bg-violet-500",
    description: "Custom build required",
  },
};

const EFFORT_OPTIONS = ["Low", "Medium", "High"];

const INITIAL_SECTIONS = [
  {
    id: 1,
    name: "Scrolling Announcement Bar",
    status: "existing",
    notes: "Standard theme announcement bar showing \"Next Day Delivery Available\". Use existing theme section as-is.",
    effort: "Low",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8719",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 2,
    name: "Header / Navigation",
    status: "existing",
    notes: "Standard theme navigation with Ruffingtons logo, Shop dropdown, Our Story, News, Stockists, Contact links. Search, account and cart icons. Use existing theme header section.",
    effort: "Low",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8717",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 3,
    name: "Hero / Main Slider",
    status: "bespoke",
    notes: "Custom hero section with two key bespoke elements:\n\n1. ROTATING STAMP: The \"Made For Dogs / Made In Britain\" rotating stamp is custom. Ability to add custom text would be great with icon upload. Hyper theme has this feature — if it's possible to replicate that, great. If not, an animated GIF can be used. The ability to place this stamp anywhere on the block would also be needed.\n\n2. VIDEO BACKGROUND: Client would like to add video here at some point. This should be part of the theme options.\n\nThe hero also includes a carousel/slider with different treat images and a \"SHOP TREATS\" CTA button.",
    effort: "High",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8338",
    page: "Homepage",
    collapsed: false,
  },
  {
    id: 4,
    name: "Best Sellers (Collection Slider)",
    status: "modified",
    notes: "Collection Slider — this is a theme option. Split layout with featured product image on the left (e.g. \"Canine Cupcakes\" with SHOP NOW link) and a text list of best sellers on the right (Canine Cupcakes, Terrier Truffles, Dog Eclairs). Uses existing collection slider section but may need carousel dot navigation and the split-view layout configured via customiser.",
    effort: "Medium",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8350",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 5,
    name: "Our Favourites (Product Grid)",
    status: "modified",
    notes: "Product grid section showing 4 products (Biscuit Paws, Dog Doughnuts, Duo Deluxe, Marbled Dog Snaps) with \"Shop All\" link. Custom element needed: Feefo review stars — styling in whatever way is possible with Feefo integration. The star ratings need to display beneath each product title alongside the review count.",
    effort: "Medium",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8426",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 6,
    name: "People Are Talking (Testimonials)",
    status: "bespoke",
    notes: "Custom testimonials carousel section. Each card includes: customer name, 5-star rating, testimonial quote, customer photo, and a linked product (e.g. \"Cainine Cupcakes\" with product thumbnail). Carousel with left/right navigation arrows. This is a bespoke section — no direct equivalent in the base theme. Needs to support multiple testimonial cards in a horizontal scrolling carousel.",
    effort: "High",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8437",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 7,
    name: "Trade CTA Block",
    status: "modified",
    notes: "\"A Treat For Your Four-Legged Guests\" — trade program signup section with REGISTER / LOGIN button. Development notes: Background image upload for the pattern (the gold/brown decorative swirl pattern), then colour scheme for the content block (Black). This will need to be added to the customiser so the client can update the background pattern and content block colour.",
    effort: "Medium",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8574",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 8,
    name: "Making Lifelong Memories (Instagram CTA)",
    status: "existing",
    notes: "Simple text section with \"SHARE THE LOVE\" subheading, \"Making Lifelong Memories\" heading, and @RUFFINGSTONSUK Instagram handle link. This can use an existing rich text or custom content theme section. No custom development needed.",
    effort: "Low",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8582",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 9,
    name: "Scrolling Image Gallery (Social Feed)",
    status: "modified",
    notes: "Scrolling horizontal gallery of lifestyle/product images in varied sizes (alternating large and small). The brand gold colour will need to be added behind the social images as a background. This may be achievable via a customiser colour setting on an existing image gallery section, or may need a bespoke section if the staggered layout isn't available in the theme.",
    effort: "Medium",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8596",
    page: "Homepage",
    collapsed: true,
  },
  {
    id: 10,
    name: "Footer",
    status: "modified",
    notes: "Standard theme footer with Ruffingtons branding, address (Mere Drove, Lade Bank, Old Leake, Boston, Lincolnshire, PE22 9RJ), phone (0800 098 8057), Shop/About/Customer Care link columns, social icons (Facebook, Instagram, TikTok), and payment icons. Development note: Feefo widget will need to be added to the footer — the Feefo Service Rating badge showing star rating and review count needs integrating into the footer layout.",
    effort: "Low",
    figmaLink: "https://www.figma.com/design/c9CHAkvaabMvEHJBiA19NA/2026-Projects-%7C-Ruffingtons?node-id=3233-8716",
    page: "Homepage",
    collapsed: true,
  },
];

const PAGES = ["All", "Homepage", "PDP", "Collection", "About"];

function StatusBadge({ status, size = "normal" }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${config.color} ${size === "small" ? "text-xs" : "text-xs"}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function EffortBadge({ effort }) {
  const colors = {
    Low: "bg-sky-50 text-sky-700 border-sky-200",
    Medium: "bg-orange-50 text-orange-700 border-orange-200",
    High: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${colors[effort]}`}
    >
      {effort} effort
    </span>
  );
}

function SectionCard({ section, onUpdate, onToggle }) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className="group rounded-xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-sm"
      style={{ marginBottom: "12px" }}
    >
      {/* Card Header - Always visible */}
      <div
        className="flex cursor-pointer items-center gap-3 px-5 py-4"
        onClick={() => onToggle(section.id)}
      >
        {/* Expand/Collapse indicator */}
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${!section.collapsed ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>

        {/* Section number */}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-500">
          {String(section.id).padStart(2, "0")}
        </span>

        {/* Section name */}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
          {section.name}
        </span>

        {/* Status + Effort badges */}
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={section.status} />
          <EffortBadge effort={section.effort} />
        </div>
      </div>

      {/* Expanded Content */}
      {!section.collapsed && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-4">
              {/* Status selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Section Status
                </label>
                <div className="flex gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => onUpdate(section.id, { status: key })}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                        section.status === key
                          ? config.color + " ring-2 ring-offset-1 ring-" + config.dot.replace("bg-", "")
                          : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                      style={section.status === key ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${key === 'existing' ? '#10b981' : key === 'modified' ? '#f59e0b' : '#8b5cf6'}` } : {}}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Effort selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Dev Effort
                </label>
                <div className="flex gap-2">
                  {EFFORT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => onUpdate(section.id, { effort: opt })}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                        section.effort === opt
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Figma link */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Figma Frame Link
                </label>
                <input
                  type="text"
                  value={section.figmaLink}
                  onChange={(e) =>
                    onUpdate(section.id, { figmaLink: e.target.value })
                  }
                  placeholder="Paste Figma frame URL..."
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 transition-colors focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>

            {/* Right column - Notes */}
            <div className="flex flex-col">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Developer Notes
              </label>
              <textarea
                value={section.notes}
                onChange={(e) =>
                  onUpdate(section.id, { notes: e.target.value })
                }
                rows={5}
                placeholder="Describe what the developer needs to know..."
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 placeholder-gray-400 transition-colors focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryBar({ sections }) {
  const counts = {
    existing: sections.filter((s) => s.status === "existing").length,
    modified: sections.filter((s) => s.status === "modified").length,
    bespoke: sections.filter((s) => s.status === "bespoke").length,
  };
  const total = sections.length;

  return (
    <div className="flex items-center gap-6 rounded-xl border border-gray-200 bg-white px-6 py-4">
      <div className="flex-1">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
          <span>Section Breakdown</span>
          <span>{total} sections total</span>
        </div>
        {/* Stacked bar */}
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
          {counts.existing > 0 && (
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${(counts.existing / total) * 100}%` }}
            />
          )}
          {counts.modified > 0 && (
            <div
              className="bg-amber-400 transition-all"
              style={{ width: `${(counts.modified / total) * 100}%` }}
            />
          )}
          {counts.bespoke > 0 && (
            <div
              className="bg-violet-500 transition-all"
              style={{ width: `${(counts.bespoke / total) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Stat pills */}
      {Object.entries(STATUS_CONFIG).map(([key, config]) => (
        <div key={key} className="text-center">
          <div className="text-2xl font-bold text-gray-900">{counts[key]}</div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className={`h-2 w-2 rounded-full ${config.dot}`} />
            {config.label}
          </div>
        </div>
      ))}

      {/* Effort summary */}
      <div className="border-l border-gray-200 pl-6 text-center">
        <div className="text-2xl font-bold text-gray-900">
          {sections.filter((s) => s.effort === "High").length}
        </div>
        <div className="text-xs text-gray-500">High effort items</div>
      </div>
    </div>
  );
}

export default function DesignToDevChecklist() {
  const [sections, setSections] = useState(INITIAL_SECTIONS);
  const [activeFilter, setActiveFilter] = useState("All");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [projectName, setProjectName] = useState("Ruffingtons Homepage Redesign");
  const [themeName, setThemeName] = useState("Shopify Theme (TBC)");

  const updateSection = (id, updates) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const toggleSection = (id) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s))
    );
  };

  const addSection = () => {
    const newId = Math.max(...sections.map((s) => s.id)) + 1;
    setSections((prev) => [
      ...prev,
      {
        id: newId,
        name: "New Section",
        status: "existing",
        notes: "",
        effort: "Low",
        figmaLink: "",
        page: activeFilter === "All" ? "Homepage" : activeFilter,
        collapsed: false,
      },
    ]);
  };

  const filtered = sections.filter((s) => {
    const pageMatch = activeFilter === "All" || s.page === activeFilter;
    const statusMatch =
      activeStatusFilter === "all" || s.status === activeStatusFilter;
    return pageMatch && statusMatch;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                Design → Dev Handoff
              </h1>
              <p className="text-xs text-gray-500">
                Section-by-section development checklist
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">Project</span>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm font-medium text-gray-700 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">Base Theme</span>
              <input
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm font-medium text-gray-700 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Summary */}
        <div style={{ marginBottom: "24px" }}>
          <SummaryBar sections={sections} />
        </div>

        {/* Legend */}
        <div
          className="flex items-center gap-6 rounded-xl border border-gray-100 bg-white/60 px-5 py-3"
          style={{ marginBottom: "24px" }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Legend
          </span>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${config.dot}`} />
              <span className="text-xs text-gray-600">
                <span className="font-semibold">{config.label}</span> —{" "}
                {config.description}
              </span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: "16px" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">
              Page
            </span>
            {PAGES.map((page) => (
              <button
                key={page}
                onClick={() => setActiveFilter(page)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  activeFilter === page
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">
              Status
            </span>
            <button
              onClick={() => setActiveStatusFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeStatusFilter === "all"
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              All
            </button>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setActiveStatusFilter(key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  activeStatusFilter === key
                    ? config.color + " border"
                    : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                {config.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section Cards */}
        <div>
          {filtered.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              onUpdate={updateSection}
              onToggle={toggleSection}
            />
          ))}
        </div>

        {/* Add section button */}
        <button
          onClick={addSection}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-white/50 py-4 text-sm font-medium text-gray-400 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Section
        </button>

        {/* Footer info */}
        <div className="mt-8 rounded-xl border border-gray-100 bg-white/60 px-5 py-4 text-center text-xs text-gray-400">
          Design → Dev Handoff Checklist &middot; Base theme:{" "}
          <span className="font-medium text-gray-600">{themeName}</span>{" "}
          &middot; {sections.length} sections across{" "}
          {[...new Set(sections.map((s) => s.page))].length} pages &middot;
          Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>
    </div>
  );
}