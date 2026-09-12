export default function Button({ variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium px-4 py-2 transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-pine text-white hover:bg-pineDark',
    secondary: 'bg-white text-ink border border-line hover:bg-paper',
    ghost: 'text-inkSoft hover:text-ink hover:bg-paper',
    danger: 'text-stageClosed hover:bg-stageClosedSoft',
  };

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
