import logoUrl from '../assets/yas-logo.svg';

export default function YasLogo({ size = 60, style = {} }) {
  return (
    <img
      src={logoUrl}
      alt="Yas"
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block', ...style }}
      draggable={false}
    />
  );
}
