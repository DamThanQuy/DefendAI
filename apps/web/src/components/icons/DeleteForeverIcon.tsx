import React from "react";

interface DeleteForeverIconProps {
  className?: string;
}

/**
 * Material Design "delete_forever" icon.
 * Source: https://fonts.google.com/icons?selected=Material%20Symbols%20Outlined%3Adelete_forever
 * Path data from the user-provided SVG (24x24, currentColor).
 */
export const DeleteForeverIcon: React.FC<DeleteForeverIconProps> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height="24px"
    viewBox="0 -960 960 960"
    width="24px"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280l80-80 80 80 56-56-80-80 80-80-56-56-80 80-80-80-56 56 80 80-80 80 56 56Zm-80 160v-520 520Z" />
  </svg>
);
