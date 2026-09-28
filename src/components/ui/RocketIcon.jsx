/**
 * RocketIcon - Icono SVG de Cohete espacial optimizado para animación de despegue
 * Cono superior azul, cuerpo blanco estilizado, ventana circular y flama en la base.
 */
export default function RocketIcon({ className = '', size = 32, ...props }) {
  return (
    <svg
      viewBox="0 0 32 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: size ? `${size}px` : undefined, height: size ? `${(size * 48) / 32}px` : undefined }}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="rocket_flame_outer" x1="16" y1="34" x2="16" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9800" />
          <stop offset="45%" stopColor="#FF5722" />
          <stop offset="100%" stopColor="#E65100" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="rocket_flame_inner" x1="16" y1="34" x2="16" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#FFF176" />
          <stop offset="85%" stopColor="#FFD54F" />
          <stop offset="100%" stopColor="#FF9800" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="rocket_body_grad" x1="10" y1="20" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="70%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <linearGradient id="rocket_fin_left" x1="4" y1="24" x2="11" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id="rocket_fin_right" x1="28" y1="24" x2="21" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
      </defs>

      {/* Flama Externa */}
      <path
        d="M12.5 35C12.5 35 13 47 16 48C19 47 19.5 35 19.5 35H12.5Z"
        fill="url(#rocket_flame_outer)"
      />
      {/* Flama Interna (Centro incandescente) */}
      <path
        d="M14 35C14 35 14.5 43.5 16 44C17.5 43.5 18 35 18 35H14Z"
        fill="url(#rocket_flame_inner)"
      />

      {/* Aleta Izquierda */}
      <path
        d="M10 24L3.5 35.5C3.5 35.5 7.5 36.5 11 33.5L11 24H10Z"
        fill="url(#rocket_fin_left)"
      />

      {/* Aleta Derecha */}
      <path
        d="M22 24L28.5 35.5C28.5 35.5 24.5 36.5 21 33.5L21 24H22Z"
        fill="url(#rocket_fin_right)"
      />

      {/* Tobera de escape en la base */}
      <path
        d="M11.5 33H20.5L19.5 35.5H12.5L11.5 33Z"
        fill="#334155"
      />

      {/* Cuerpo principal del cohete */}
      <path
        d="M16 2.5C11.5 10 10 21 10 33H22C22 21 20.5 10 16 2.5Z"
        fill="url(#rocket_body_grad)"
      />

      {/* Sombra / Relieve sutil en lateral del fuselaje */}
      <path
        d="M16 2.5C18 10 22 21 22 33H16V2.5Z"
        fill="#CBD5E1"
        opacity="0.35"
      />

      {/* Punta cónica superior (azul) */}
      <path
        d="M16 2.5C14.3 6 13.1 9.8 12.3 13H19.7C18.9 9.8 17.7 6 16 2.5Z"
        fill="#2563EB"
      />

      {/* Anillo de la ventana circular */}
      <circle cx="16" cy="20" r="4.2" fill="#1E293B" stroke="#94A3B8" strokeWidth="1" />
      {/* Cristal de la ventana */}
      <circle cx="16" cy="20" r="3.2" fill="#38BDF8" />
      {/* Brillo especular de la ventana */}
      <ellipse cx="15.2" cy="18.8" rx="1.2" ry="0.8" fill="#FFFFFF" opacity="0.85" />
    </svg>
  )
}
