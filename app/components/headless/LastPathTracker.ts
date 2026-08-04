import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { writeLastPath } from "/utils/last-path.client";

/** Saves the current SPA path so reload / splash can restore it. */
export default function LastPathTracker() {
  const { path } = useLocation();

  useEffect(() => {
    if (!path) return;
    writeLastPath(path.startsWith("/") ? path : `/${path}`);
  }, [path]);

  return null;
}
