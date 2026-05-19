// Logo mark for the TopBar. Source asset at frontend/public/brandmark.svg
// (226x226 viewBox, baked-in ink colour; not currentColor-tinted because the
// file ships with fixed near-black fills).
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
