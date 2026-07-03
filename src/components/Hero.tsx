import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, CalendarCheck, ArrowRight, ShieldCheck, UserCheck, Star, Clock, Trophy } from 'lucide-react';
import { getShortPatientId } from '../lib/timeUtils';

interface HeroProps {
  onOpenBooking: () => void;
  heroImage: string; // Dynamic path for generated image
  activePatient?: any;
}

export default function Hero({ onOpenBooking, heroImage, activePatient }: HeroProps) {
  return (
    <section 
      id="home"
      className="relative min-h-screen pt-32 pb-16 md:pt-40 md:pb-24 flex items-center justify-center overflow-hidden bg-slate-50"
    >
      {/* Background blobs / floating glowing lights */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/10 w-96 h-96 bg-sky-200/40 rounded-full blur-3xl animate-float-light" />
        <div className="absolute bottom-1/3 right-1/10 w-[450px] h-[450px] bg-blue-100/40 rounded-full blur-3xl animate-float-light-delayed" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-sky-100/30 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Hero Copy Column (Left on desktop, Top on mobile) */}
          <div className="col-span-12 lg:col-span-6 text-right order-first lg:order-none" dir="rtl">
            <div className="space-y-6">
              
              {/* Top luxury badge & Personalization Banner */}
              <div className="flex flex-col gap-3 items-start justify-start">
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-100/50 rounded-full"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                  <span className="text-xs font-bold text-sky-600 font-sans">أحدث تقنيات طب تجميل الأسنان بميت غمر</span>
                </motion.div>

                {activePatient && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-right w-full sm:w-auto"
                  >
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                      <UserCheck className="w-4.5 h-4.5" />
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-800 leading-none">مرحباً بك مجدداً، {activePatient.name}</h4>
                      <p className="text-[10px] text-emerald-600 font-mono mt-1 font-bold">ملفك الطبي: {getShortPatientId(activePatient.id)}</p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Core Headline */}
              <motion.h1 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-950 leading-[1.25] tracking-tight"
              >
                الابتسامة التي <br className="hidden sm:inline" />
                <span className="text-transparent bg-clip-text bg-gradient-to-l from-sky-500 via-sky-600 to-blue-600">تستحقها تبدأ هنا</span>
              </motion.h1>

              {/* Subtitle description */}
              <motion.p 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-xl ml-auto"
              >
                في عيادة <strong className="text-slate-800 font-bold">Azure Dental Clinic</strong> نجمع بين خبرة نخبة من أخصائيي مستشفى ميت غمر العام وأحدث تقنيات طب الأسنان الرقمي لنقدم لك تجربة علاجية دقيقة، مريحة، وبدون ألم على الإطلاق.
              </motion.p>

              {/* CTA buttons */}
              <div className="space-y-4">
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="flex flex-wrap gap-3 pt-2"
                >
                  <button
                    id="hero-primary-cta"
                    onClick={onOpenBooking}
                    className="px-7 py-4 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-sky-500/20 hover:shadow-xl transition-all flex items-center gap-2 hover:translate-y-[-1px] cursor-pointer animate-pulse-subtle"
                  >
                    <CalendarCheck className="w-4 h-4" />
                    <span>احجز موعدك الآن</span>
                  </button>

                  <a
                    id="hero-secondary-cta"
                    href="#services"
                    className="px-7 py-4 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-1"
                  >
                    <span>استكشف خدماتنا</span>
                    <ArrowRight className="w-4 h-4 rotate-180 shrink-0" />
                  </a>
                </motion.div>

                {/* Smile Studio Teaser Promo */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="pt-1.5"
                >
                  <a
                    id="hero-smilestudio-teaser-cta"
                    href="#smile-studio"
                    className="inline-flex items-center gap-2.5 px-4.5 py-3 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/15 hover:border-sky-500/30 transition-all text-xs text-sky-800 hover:text-sky-950 font-bold rounded-2xl cursor-pointer shadow-sm shadow-sky-500/5 leading-normal"
                  >
                    <Sparkles className="w-4 h-4 text-sky-600 shrink-0 animate-pulse" />
                    <span>محتار ولا تعرف ماذا تحتاج أسنانك؟ اعرف خطتك وعلاجك في دقيقة واحدة مجاناً</span>
                    <span className="text-sky-600 font-mono text-sm leading-none shrink-0">←</span>
                  </a>
                </motion.div>
              </div>

              {/* Trust Badges - Grid / Flex list */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="border-t border-slate-200/60 pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4"
              >
                {/* Badge 1 */}
                <div className="flex items-center gap-2 group">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-colors duration-300">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 leading-none">بدون ألم</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">تخدير ذكي متطور</p>
                  </div>
                </div>

                {/* Badge 2 */}
                <div className="flex items-center gap-2 group">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-colors duration-300">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 leading-none">تعقيم صارم</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">معايير ألمانية فائقة</p>
                  </div>
                </div>

                {/* Badge 3 */}
                <div className="flex items-center gap-2 group">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-colors duration-300">
                    <UserCheck className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 leading-none">أطباء متميزون</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">أخصائيو مستشفى ميت غمر</p>
                  </div>
                </div>

                {/* Badge 4 */}
                <div className="flex items-center gap-2 group">
                  <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-colors duration-300">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 leading-none">مواعيد دقيقة</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">احترام وقت المريض</p>
                  </div>
                </div>
              </motion.div>

            </div>
          </div>

          {/* Hero Visual Column (Right on desktop, Bottom on mobile) */}
          <div className="col-span-12 lg:col-span-6 flex justify-center order-last lg:order-none">
            <div className="relative w-full max-w-lg lg:max-w-none px-2 sm:px-4">
              
              {/* Decorative Frame */}
              <div className="absolute inset-2 -right-1 -bottom-2 md:inset-4 md:-right-1 md:-bottom-4 border md:border-2 border-dashed border-sky-200 rounded-[24px] md:rounded-[32px] pointer-events-none -z-10" />

              {/* Main Luxury Image */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="relative rounded-[24px] md:rounded-[32px] overflow-hidden shadow-2xl shadow-sky-950/5 aspect-[16/10] sm:aspect-[4/3] bg-white border border-white/50"
              >
                <img 
                  src={heroImage} 
                  alt="Azure Dental Clinic Interior" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                
                {/* Subtle overlay gradient for luxury feeling */}
                <div className="absolute inset-0 bg-gradient-to-t from-sky-950/20 via-transparent to-transparent" />
              </motion.div>

              {/* FLOATING GLASS CARDS */}
              
              {/* Floating Card 1: Patients Rating */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="absolute -top-3 -right-1 sm:-top-6 sm:-right-4 bg-white/80 backdrop-blur-md border border-slate-100 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg flex items-center gap-2.5 sm:gap-3"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-amber-500/10 text-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                  <Star className="w-4 h-4 sm:w-5 sm:h-5 fill-amber-500" />
                </div>
                <div>
                  <h4 className="text-[10px] sm:text-xs font-bold text-slate-500 leading-none">معدل التقييم</h4>
                  <p className="text-xs sm:text-base font-extrabold text-slate-900 mt-0.5 sm:mt-1 font-mono">4.9 / 5.0</p>
                </div>
              </motion.div>

              {/* Floating Card 2: Satisfied Patients */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="absolute -bottom-3 -left-1 sm:-bottom-6 sm:-left-4 bg-white/80 backdrop-blur-md border border-slate-100 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg flex items-center gap-2.5 sm:gap-3"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-sky-500/10 text-sky-500 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h4 className="text-[10px] sm:text-xs font-bold text-slate-500 leading-none">مريض سعيد</h4>
                  <p className="text-xs sm:text-base font-extrabold text-slate-900 mt-0.5 sm:mt-1 font-mono">5000+</p>
                </div>
              </motion.div>

              {/* Floating Card 3: Modern Tech */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="absolute top-1/2 -translate-y-1/2 -left-1 sm:-left-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-2 sm:p-3 rounded-lg sm:rounded-xl shadow-xl flex items-center gap-1.5 sm:gap-2.5 text-white"
              >
                <span className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="text-[10px] sm:text-xs font-bold font-sans tracking-wide">أحدث أجهزة الـ 3D الرقمية</span>
              </motion.div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
