import {
  GraduationCap,
  LayoutDashboard,
  Image,
  Library,
  Settings,
  Users,
  Waves as WavesIcon,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/api/types";
import { isManager, visibleNav } from "@/lib/roles";

export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  /** Destination for leaf items; omitted for expandable sections. */
  href?: string;
  label: string;
  icon: LucideIcon;
  key: keyof ReturnType<typeof visibleNav>;
  /** Present = the item expands into a submenu instead of linking anywhere. */
  children?: NavChild[];
}

const ALL_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, key: "overview" },
  {
    label: "Contenido",
    icon: Library,
    key: "courses",
    children: [
      { href: "/courses", label: "Courses" },
      { href: "/downloads", label: "Downloads" },
      { href: "/bundles", label: "Bundles" },
    ],
  },
  { href: "/media", label: "Medios", icon: Image, key: "media" },
  { href: "/students", label: "Trabajadores", icon: Users, key: "students" },
  { href: "/waves", label: "Olas", icon: WavesIcon, key: "waves" },
  { href: "/automations", label: "Automations", icon: Workflow, key: "automations" },
  { href: "/settings", label: "Configuración", icon: Settings, key: "settings" },
];

/** The manager (Admin Cliente) sees the Olas report surface first and no
 *  authoring home — their nav leads with Olas and Trabajadores. */
const MANAGER_ORDER: Partial<Record<keyof ReturnType<typeof visibleNav>, number>> = {
  waves: 0,
  students: 1,
  courses: 2,
  media: 3,
  settings: 4,
};

/** Filter nav by what the role is allowed to see, in the order that role
 *  works in. */
export function navForRole(role: Role): NavItem[] {
  const vis = visibleNav(role);
  const items = ALL_NAV.filter((item) => vis[item.key]);
  if (isManager(role)) {
    return items.toSorted(
      (a, b) => (MANAGER_ORDER[a.key] ?? 99) - (MANAGER_ORDER[b.key] ?? 99),
    );
  }
  return items;
}
