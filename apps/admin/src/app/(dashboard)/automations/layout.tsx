import type { ReactNode } from "react";
import { notFound } from "next/navigation";

export default function AutomationsLayout({ children: _children }: { children: ReactNode }) {
  notFound();
}
