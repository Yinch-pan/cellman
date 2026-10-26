import React from "react";
import type { BuildingKind } from "../../../packages/rules/src/types";
import { label } from "./api";
import { t } from "./i18n";

// Original SVG silhouettes redrawn from the component shapes on rulebook page 3.
export const buildingShapes: Record<
  BuildingKind,
  { outline: string; detail: string }
> = {
  workshop: {
    outline: "M-12 9 V-7 L0-17 12-7 V9 Z",
    detail: "M0-17 V-3 L12 3 M0-3 L-12-7",
  },
  guild: {
    outline: "M-17 10 V-4 H-5 V-14 L4-20 15-12 V10 Z",
    detail: "M-5-4 H5 V-12 L4-20 M5-12 L15-8 M5-4 V10",
  },
  school: {
    outline: "M-15-10 C-15-19 15-19 15-10 V6 C15 16-15 16-15 6 Z",
    detail: "M-15-10 C-15-1 15-1 15-10 M-15 4 C-15 13 15 13 15 4",
  },
  university: {
    outline: "M-18 10 V-6 H-11 L-6-12 C-6-23 6-23 6-12 L12-6 H18 V10 Z",
    detail: "M-11-6 H-5 L0-11 6-6 H12 M0-11 V10",
  },
  palace: {
    outline: "M-18 11 V-18 L-9-9 0-21 9-9 18-18 V11 H5 V4 Q0-3-5 4 V11 Z",
    detail: "M-18-6 L-9 2 0-7 9 2 18-6",
  },
  tower: {
    outline:
      "M-10 11 L-7 5 V-3 L-10-5 V-9 L-7-11 V-15 L0-21 7-15 V-11 L10-9 V-5 L7-3 V5 L10 11 Z",
    detail: "M-7-11 H7 M-7-3 H7 M-7 5 H7",
  },
  monument: {
    outline: "M-18 11 L-15-8-8-2 0-25 7-11 13-15 18 11 Z",
    detail: "M0-25 L3 8 M-8-2 L-5 11 M7-11 L9 11",
  },
};
export function MapBuilding({
  kind,
  x = 0,
  y = 0,
  color,
  neutral = false,
  annex = false,
}: {
  kind: BuildingKind;
  x?: number;
  y?: number;
  color: string;
  neutral?: boolean;
  annex?: boolean;
}) {
  const shape = buildingShapes[kind];
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="map-building"
      data-building={kind}
      aria-hidden="true"
    >
      <path
        d={shape.outline}
        fill={neutral ? "#f6f3e9" : color}
        stroke="#263a34"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path
        d={shape.detail}
        fill="none"
        stroke={neutral ? "#7f847a" : "#fff"}
        strokeOpacity={0.55}
        strokeWidth={1.2}
      />
      {neutral && <path d="M-12 14 H12" stroke={color} strokeWidth={3} />}
      {annex && (
        <path
          d="M-20 7 L-15 2-10 7 V15 H-20 Z"
          fill="#965791"
          stroke="#342c40"
          strokeWidth={1.2}
        />
      )}
    </g>
  );
}
export function BuildingLegend() {
  return (
    <div className="building-legend" aria-label={t("building.legend")}>
      {(Object.keys(buildingShapes) as BuildingKind[]).map((kind) => (
        <span key={kind}>
          <svg viewBox="-23 -27 46 46" aria-hidden="true">
            <MapBuilding kind={kind} color="#66826d" />
          </svg>
          {label(kind)}
        </span>
      ))}
    </div>
  );
}
