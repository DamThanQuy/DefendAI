import React from "react";

interface PlusIconProps {
  className?: string;
}

/**
 * Material Design "add" (plus) icon.
 * Source: https://fonts.google.com/icons?selected=Material%20Symbols%20Outlined%3Aadd
 * Path data from the user-provided SVG (24x24, currentColor).
 */
export const PlusIcon: React.FC<PlusIconProps> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height="24px"
    viewBox="0 -960 960 960"
    width="24px"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
  </svg>
);
