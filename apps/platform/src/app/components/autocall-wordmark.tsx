import localFont from 'next/font/local';

// The same Latin font asset used in Supernizo Heavy's built wordmark.
const bungeeHairline = localFont({
  src: '../../assets/fonts/bungee-hairline-latin.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
});

export function AutocallWordmark() {
  return (
    <span className="workspace-wordmark" aria-label="Supernizo Autocall">
      <span className="workspace-wordmark-name">supernizo</span>
      <span className={`workspace-wordmark-product ${bungeeHairline.className}`}>AUTOCALL</span>
    </span>
  );
}
