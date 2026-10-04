import React from 'react';

export const JackOLanternIcon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 32
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 drop-shadow-[0_2px_12px_rgba(255,122,0,0.65)] ${className}`}
    >
      {/* Top Face - Pumpkin Orange with Stem */}
      <polygon points="16,2 30,9 16,16 2,9" fill="#ea580c" />
      <polygon points="16,3 28,9 16,15 4,9" fill="#f97316" />
      {/* Pumpkin Top Stem */}
      <polygon points="15,7 17,6 18,9 14,9" fill="#451a03" />

      {/* Left Face - Pumpkin Ridges */}
      <polygon points="2,9 16,16 16,30 2,23" fill="#c2410c" />
      {/* Left ridge stripes */}
      <polygon points="5,11 8,12 8,24 5,23" fill="#9a3412" />
      <polygon points="11,14 13,15 13,27 11,26" fill="#9a3412" />

      {/* Right Face - Carved Glowing Jack-o'-Lantern Face */}
      <polygon points="16,16 30,9 30,23 16,30" fill="#9a3412" />
      {/* Carved Left Eye (Triangle) */}
      <polygon points="18,17 21,15 21,18" fill="#fef08a" />
      <polygon points="18,17 20,15 20,17" fill="#facc15" />
      {/* Carved Right Eye (Triangle) */}
      <polygon points="25,13 28,12 27,15" fill="#fef08a" />
      <polygon points="25,13 27,12 26,14" fill="#facc15" />
      {/* Carved Nose */}
      <polygon points="22,18 24,17 23,19" fill="#facc15" />
      {/* Carved Toothy Mouth */}
      <polygon points="18,22 20,21 21,23 23,20 25,22 27,19 28,21 27,24 24,25 21,26 18,24" fill="#fef08a" />
      <polygon points="19,23 21,22 22,24 24,21 26,23 25,24 22,25 19,24" fill="#ea580c" />
    </svg>
  );
};

export const GrassBlockIcon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 32
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 drop-shadow-[0_2px_8px_rgba(0,230,118,0.4)] ${className}`}
    >
      {/* Top Face - Green Grass */}
      <polygon points="16,2 30,9 16,16 2,9" fill="#5cb836" />
      <polygon points="16,4 28,10 16,15 4,10" fill="#6bc93d" />
      <polygon points="10,6 16,9 13,11 7,8" fill="#7ed94e" />

      {/* Left Face - Dirt with grass fringe */}
      <polygon points="2,9 16,16 16,30 2,23" fill="#694d33" />
      {/* Left grass drape */}
      <polygon points="2,9 16,16 16,19 14,19 14,17 10,17 10,19 8,19 8,16 5,16 5,18 2,15" fill="#4d9929" />
      {/* Left dirt texture pixels */}
      <rect x="5" y="19" width="3" height="3" fill="#573e27" />
      <rect x="10" y="22" width="3" height="3" fill="#4b3520" />
      <rect x="6" y="24" width="2" height="2" fill="#7a5a3d" />

      {/* Right Face - Darker Dirt with grass fringe */}
      <polygon points="16,16 30,9 30,23 16,30" fill="#573e27" />
      {/* Right grass drape */}
      <polygon points="16,16 30,9 30,15 27,18 27,16 24,16 24,19 22,19 22,17 18,17 18,19 16,19" fill="#3f8021" />
      {/* Right dirt texture pixels */}
      <rect x="23" y="19" width="3" height="3" fill="#4b3520" />
      <rect x="18" y="22" width="3" height="3" fill="#694d33" />
      <rect x="24" y="24" width="2" height="2" fill="#7a5a3d" />
    </svg>
  );
};

export const NetcraftLogo: React.FC<{
  showSubtitle?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ showSubtitle = false, size = 'md', className = '' }) => {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 40 : 32;
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl sm:text-2xl';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative group">
        <JackOLanternIcon size={iconSize} className="halloween-flicker" />
      </div>
      <div className="flex flex-col leading-none">
        <div className={`font-black font-heading tracking-wider ${textSize} text-white flex items-center gap-1.5`}>
          <span>NETCRAFT</span>
          <span className="text-[#ff7a00] drop-shadow-[0_0_14px_rgba(255,122,0,0.8)]">BR</span>
          <span className="text-[10px] font-mono tracking-widest uppercase bg-[#ff7a00]/20 text-[#ff9800] border border-[#ff7a00]/40 px-1.5 py-0.5 rounded-sm ml-1 select-none">
            🎃 HALLOWEEN
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[11px] text-amber-200/60 font-normal tracking-normal mt-1">
            Edição Especial de Halloween 2026 • Bedrock
          </span>
        )}
      </div>
    </div>
  );
};
