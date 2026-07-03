import React, { useState, useEffect } from 'react';
import { Sparkles, HeartPulse, Activity, UserRound } from 'lucide-react';

export default function QuickJump() {
  const [activeTab, setActiveTab] = useState('chapter-1');
  const [isScrolled, setIsScrolled] = useState(false);

  const tabs = [
    { id: 'chapter-1', label: 'الرئيسية والتشخيص', icon: <Sparkles className="w-3.5 h-3.5" />, href: '#home' },
    { id: 'chapter-2', label: 'الخدمات والعروض', icon: <HeartPulse className="w-3.5 h-3.5" />, href: '#services' },
    { id: 'chapter-3', label: 'قبل وبعد والرحلة', icon: <Activity className="w-3.5 h-3.5" />, href: '#cases' },
    { id: 'chapter-4', label: 'الأطباء والتواصل', icon: <UserRound className="w-3.5 h-3.5" />, href: '#doctors' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
      const scrollPosition = window.scrollY + 180;
      
      // Determine which section is currently active based on vertical scroll
      const chapters = [
        { id: 'chapter-4', selector: '#doctors' },
        { id: 'chapter-3', selector: '#cases' },
        { id: 'chapter-2', selector: '#services' },
        { id: 'chapter-1', selector: '#home' },
      ];

      for (const chap of chapters) {
        const el = document.querySelector(chap.selector);
        if (el) {
          const rect = el.getBoundingClientRect();
          const top = rect.top + window.scrollY;
          if (scrollPosition >= top) {
            setActiveTab(chap.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Trigger initial calculation
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleTabClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string, id: string) => {
    e.preventDefault();
    setActiveTab(id);
    const target = document.querySelector(href);
    if (target) {
      const headerOffset = isScrolled ? 110 : 130; // offset for fixed navbar + quick jump bar
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div 
      className={`md:hidden fixed left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm overflow-x-auto scrollbar-none py-2 px-4 transition-all duration-300 ${
        isScrolled ? 'top-[58px]' : 'top-[78px]'
      }`}
      dir="rtl"
    >
      <div className="flex gap-2 min-w-max">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <a
              key={tab.id}
              href={tab.href}
              onClick={(e) => handleTabClick(e, tab.href, tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all border ${
                isActive 
                  ? 'bg-sky-500 text-white border-sky-600 shadow-sm' 
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
