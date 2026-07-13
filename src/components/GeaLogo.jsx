
export default function GeaLogo({ size = 'medium', className = '' }) {
  // Dimensions depending on size
  const sizes = {
    small: { width: '120px' },
    medium: { width: '180px' },
    large: { width: '280px' }
  }

  const currentSize = sizes[size] || sizes.medium

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/logo_wfm.png"
        alt="GEA WFM Logo"
        style={{ width: currentSize.width, height: 'auto', objectFit: 'contain' }}
        className="flex-shrink-0"
      />
    </div>
  )
}
