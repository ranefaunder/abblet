import { useEffect } from "preact/hooks";
import type { RoutePropsForPath } from "preact-iso";
import { useLocation } from "preact-iso";
import { getLang } from "/utils/lang";

export const GalleryPath = "/:lang/gallery" as const;

/** Legacy gallery URL → App Store home. */
export default function Gallery(_props: RoutePropsForPath<typeof GalleryPath>) {
  const { path, route } = useLocation();
  const lang = getLang(path ?? "") ?? "en";

  useEffect(() => {
    route(`/${lang}/`, true);
  }, [lang, route]);

  return null;
}
