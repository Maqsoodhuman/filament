// The Filament brand mark — a glowing amber filament (a dot ringed by rays).
// Amber is the colour law: the mark literally is a lit structural connection.
export default function BrandMark() {
  return (
    <span className="mark" aria-hidden="true">
      <span className="dot" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
        <span
          key={d}
          className="ray"
          style={{ transform: `translate(-50%,-50%) rotate(${d}deg)` }}
        />
      ))}
    </span>
  );
}
