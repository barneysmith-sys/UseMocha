/** Design tokens for the landscape prototype. CSS mirrors these in app/globals.css. */

export const color = {
  cobalt: "#0053FD",
  cobaltDeep: "#0043E0",
  blue: "#0754FF",
  blueDeep: "#0438B0",
  blueSoft: "#EEF3FF",
  snow: "#FFFFFF",
  ice: "#E6EEFF",
  paper: "#F6F7F9",
  ink: "#0B1220",
  muted: "#5E6779",
  quiet: "#3D4659",
  line: "#E4E7EE",
  lineStrong: "#D5DAE3",
} as const;

export const motion = {
  ease: [0.22, 1, 0.36, 1] as const,
  spring: { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.85 },
  reveal: 2.6,
};
