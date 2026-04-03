import { createElement, type ElementType, type ReactNode } from "react";

export type MalvRegionOptions = {
  region: string;
  id?: string;
  label?: string;
  type?: string;
};

export type MalvRegionDataProps = {
  "data-malv-region": string;
  "data-malv-region-id": string;
  "data-malv-region-label"?: string;
  "data-malv-region-type"?: string;
};

export function stableMalvRegionId(options: MalvRegionOptions): string {
  const explicit = String(options.id ?? "").trim();
  if (explicit) return explicit;
  const label = toSlug(options.label ?? "");
  if (label) return `${toSlug(options.region)}.${label}`;
  const type = toSlug(options.type ?? "");
  if (type) return `${toSlug(options.region)}.${type}`;
  return toSlug(options.region);
}

export function getMalvRegionProps(options: MalvRegionOptions): MalvRegionDataProps {
  const region = String(options.region || "region").trim();
  const id = stableMalvRegionId(options);
  const label = String(options.label ?? "").trim();
  const type = String(options.type ?? "").trim();
  return {
    "data-malv-region": region,
    "data-malv-region-id": id,
    ...(label ? { "data-malv-region-label": label } : {}),
    ...(type ? { "data-malv-region-type": type } : {})
  };
}

type MalvRegionProps = MalvRegionOptions & {
  as?: ElementType;
  children?: ReactNode;
} & Record<string, unknown>;

export function MalvRegion({ as = "section", children, ...rest }: MalvRegionProps) {
  const { region, id, label, type, ...props } = rest;
  return createElement(as, { ...props, ...getMalvRegionProps({ region, id, label, type }) }, children);
}

function toSlug(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
