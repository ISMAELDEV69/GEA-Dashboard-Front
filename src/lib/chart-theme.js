/**
 * Centralized Chart Theme for GEA DataCenter Dashboards
 * Provides harmonic color scales, gradients, grid settings, and tooltip configurations.
 */

export const chartColors = {
  // Embudo de Conversión (Paleta armónica de retención progresiva)
  funnelGradient: [
    '#3B82F6', // Nómina (Blue)
    '#6366F1', // Día 0 (Indigo)
    '#8B5CF6', // Día 1 (Violet)
    '#10B981', // OJT (Emerald)
    '#F59E0B', // I-OP (Amber)
    '#06B6D4', // Activos Actuales (Cyan)
  ],

  // Campañas (Cyan primario consistente)
  campaignPrimary: '#06B6D4',
  campaignHover: '#0891B2',

  // Deserción y Bajas (Rojo semántico)
  desertionPrimary: '#EF4444',
  desertionFill: 'rgba(239, 68, 68, 0.25)',

  // Grid y Ejes
  gridStroke: 'var(--border-normal)',
  axisTick: 'var(--text-muted)',
};

export const chartConfig = {
  cartesianGrid: {
    strokeDasharray: '3 3',
    stroke: 'var(--border-normal)',
    opacity: 0.25,
    vertical: false,
  },
  xAxis: {
    stroke: 'var(--text-muted)',
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  },
  yAxis: {
    stroke: 'var(--text-muted)',
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  },
};
