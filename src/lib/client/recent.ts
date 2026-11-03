"use client";

import { store } from "./storage";

/** The products this browser opened, newest first: the home page's "Vus récemment" and "Pour vous". Never sent anywhere. */
const KEY = "mena_recent";
const MAX = 20;

export function rememberViewed(id: string) {
  const list = [id, ...readViewed().filter((x) => x !== id)].slice(0, MAX);
  store.set(KEY, list.join(","));
}

export function readViewed(): string[] {
  return (store.get(KEY) ?? "").split(",").filter((x) => /^[a-z0-9]{20,40}$/.test(x));
}
