import React from "react";

interface RestoreIconProps {
  className?: string;
}

/**
 * Material Design "restore_from_trash" icon.
 * Source: https://fonts.google.com/icons?selected=Material%20Symbols%20Outlined%3Arestore_from_trash
 * Path data from the user-provided SVG (24x24, currentColor).
 */
export const RestoreIcon: React.FC<RestoreIconProps> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height="24px"
    viewBox="0 -960 960 960"
    width="24px"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M440-320h80v-167l64 64 56-57-160-160-160 160 56 57 64-64v167ZM280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520Zm-400 0v520-520Z" />
  </svg>
);
