// Logo mark for the TopBar. Source asset at frontend/public/brandmark.svg
// (64x64 viewBox, sealed-document silhouette: heavy ink frame with a filled
// core notched at the top-right corner). Solid #181818 fill — for inverse
// surfaces use frontend/public/brandmark-paper.svg or inline the SVG.
export function BrandMark() {
  return (
    <img
      src="/brandmark.svg"
      width={24}
      height={24}
      alt=""
      aria-hidden="true"
      className="block select-none"
      draggable={false}
    />
  );
}
