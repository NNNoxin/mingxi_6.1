import type { AdminTransport } from "./types";

export const transport: AdminTransport = {
  mode: "live",
  send: (url, init) => fetch(url, init),
};
