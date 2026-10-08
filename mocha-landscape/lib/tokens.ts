/** Design tokens for the landscape prototype. CSS mirrors these in app/globals.css. */

export const color = {
  cobalt: "#0053FD",
  cobaltDeep: "#0043E0",
  snow: "#FFFFFF",
  ice: "#E6EEFF",
  paper: "#F4F7FB",
  ink: "#0C1730",
  muted: "#5C6C88",
  line: "rgba(12, 23, 48, 0.12)",
} as const;

export const motion = {
  ease: [0.22, 1, 0.36, 1] as const,
  spring: { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.85 },
  reveal: 2.6,
};
