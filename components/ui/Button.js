export default function Button({ variant = 'primary', pill = false, className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 text-[13.5px] font-medium px-[18px] py-3 transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed';

  const shape = pill ? 'rounded-full' : 'rounded-md';

  const variants = {
    primary: 'bg-ink text-[#fffdf7] hover:bg-[#2c2f22]',
    secondary: 'bg-surface text-ink border border-line hover:border-ink',
    ghost: 'text-inkSoft hover:text-ink hover:bg-panel',
    danger: 'text-stageClosed hover:bg-stageClosedSoft',
  };

  return <button className={`${base} ${shape} ${variants[variant]} ${className}`} {...props} />;
}
