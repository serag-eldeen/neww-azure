import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import TrustBar from './components/TrustBar';
import OfferSection from './components/OfferSection';
import ServicesSection from './components/ServicesSection';
import WhyChooseUs from './components/WhyChooseUs';
import DoctorsSection from './components/DoctorsSection';
import FAQSection from './components/FAQSection';
import Footer from './components/Footer';

const BookingModal = React.lazy(() => import('./components/BookingModal'));
const MyBookings = React.lazy(() => import('./components/MyBookings'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const BeforeAfter = React.lazy(() => import('./components/BeforeAfter'));
const ClinicGallery = React.lazy(() => import('./components/ClinicGallery'));
const Testimonials = React.lazy(() => import('./components/Testimonials'));
const SmileStudio = React.lazy(() => import('./components/SmileStudio'));
const TreatmentJourney = React.lazy(() => import('./components/TreatmentJourney'));
const ShadeSelector = React.lazy(() => import('./components/ShadeSelector'));
const DentalTipsHub = React.lazy(() => import('./components/DentalTipsHub'));

import FloatingControls from './components/FloatingControls';
import { Appointment } from './types';
import { initClinicDb, getIsStaffOrAdmin, setIsStaffOrAdmin } from './clinicDb';
import { heroClinicInterior, advancedDentalTech, doctorExpertPortrait } from './lib/images';

export default function App() {
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [myBookingsOpen, setMyBookingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [preselectedServiceId, setPreselectedServiceId] = useState<string | undefined>(undefined);
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [activePatient, setActivePatient] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  // Initialize Clinic Database on Mount in the background to avoid render blocking
  useEffect(() => {
    initClinicDb().then(() => {
      setDbReady(true);
      setIsAdmin(sessionStorage.getItem('azure_admin_authenticated') === 'true' && getIsStaffOrAdmin());
    });
  }, []);

  // Sync active patient and admin sessions
  const syncSessions = () => {
    // 1. Patient Session
    const activeSession = localStorage.getItem('azure_active_patient');
    if (activeSession && activeSession !== 'undefined' && activeSession !== 'null') {
      try {
        const patient = JSON.parse(activeSession);
        if (patient && patient.id) {
          setActivePatient(patient);
        } else {
          setActivePatient(null);
        }
      } catch (err) {
        console.error(err);
        setActivePatient(null);
      }
    } else {
      setActivePatient(null);
    }

    // 2. Admin Session - Derives security from both sessionStorage and checked secure in-memory backend status
    const isAuthSession = sessionStorage.getItem('azure_admin_authenticated') === 'true' && getIsStaffOrAdmin();
    setIsAdmin(isAuthSession);
  };

  useEffect(() => {
    syncSessions();
  }, [myBookingsOpen, adminOpen, refreshTrigger, dbReady]);

  const handleLogout = () => {
    localStorage.removeItem('azure_active_patient');
    setActivePatient(null);
    setRefreshTrigger(prev => !prev);
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('azure_admin_authenticated');
    setIsAdmin(false);
    setAdminOpen(false);
    setIsStaffOrAdmin(false); // Clear secure in-memory flag
    setRefreshTrigger(prev => !prev);
  };

  // Dynamic image paths for our custom generated premium clinic assets
  const clinicInteriorImg = heroClinicInterior;
  const digitalScannerImg = advancedDentalTech;
  const doctorPortraitImg = doctorExpertPortrait;

  // Sync current bookings count on load and updates
  useEffect(() => {
    const existing = localStorage.getItem('azure_bookings');
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as Appointment[];
        setBookingsCount(parsed.length);
      } catch (err) {
        console.error(err);
      }
    }
  }, [bookingModalOpen, refreshTrigger, myBookingsOpen]);

  const handleOpenBooking = (serviceId?: string) => {
    setPreselectedServiceId(serviceId);
    setBookingModalOpen(true);
  };

  const handleBookingSuccess = (newApp: Appointment) => {
    setBookingsCount(prev => prev + 1);
    setRefreshTrigger(prev => !prev);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 relative antialiased selection:bg-sky-500/20 selection:text-sky-500">
      
      {/* Dynamic sticky header */}
      <Navbar 
        onOpenBooking={() => handleOpenBooking()}
        onOpenMyBookings={() => setMyBookingsOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
        bookingsCount={bookingsCount}
        activePatient={activePatient}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        onAdminLogout={handleAdminLogout}
      />

      {/* Main Page Layout Content Flow */}
      <main className="flex-grow">
        
        {/* Section 1: Hero Visual Entrance */}
        <Hero 
          onOpenBooking={() => handleOpenBooking()} 
          heroImage={clinicInteriorImg}
        />

        {/* Section 2: Floating trust bar values */}
        <TrustBar />

        {/* Section 3: Exclusive Limited Promo details */}
        <OfferSection onOpenBooking={() => handleOpenBooking()} />

        {/* Section 4: Bento grid services list with technical details */}
        <ServicesSection onOpenBooking={(id) => handleOpenBooking(id)} />

        {/* Section 5: Clinial pillars split details (Doctors, Tech, Sterilization, Care) */}
        <WhyChooseUs 
          doctorImage={doctorPortraitImg}
          techImage={digitalScannerImg}
          onOpenBooking={() => handleOpenBooking()}
        />

        {/* Section 6: Interactive Drag-slider Before & After teeth alignment comparison */}
        <React.Suspense fallback={<div className="py-12 text-center text-slate-400">جاري تحميل معرض الصور...</div>}>
          <BeforeAfter />
        </React.Suspense>

        {/* Section 6b: Smart Interactive Smile & Comfort Assessment Studio */}
        <React.Suspense fallback={<div className="py-12 text-center text-slate-400">جاري تحميل استوديو الابتسامة...</div>}>
          <SmileStudio onOpenBooking={(id) => handleOpenBooking(id)} />
        </React.Suspense>

        {/* Section 6c: Smart Interactive Treatment Roadmap & Journey */}
        <React.Suspense fallback={<div className="py-12 text-center text-slate-400">جاري تحميل رحلة العلاج...</div>}>
          <TreatmentJourney />
        </React.Suspense>

        {/* Section 6d: Smart Interactive Cosmetic Smile Shade Selector */}
        <React.Suspense fallback={<div className="py-12 text-center text-slate-400">جاري تحميل محدد الألوان...</div>}>
          <ShadeSelector />
        </React.Suspense>

        {/* Section 7: Specialist profiles and certifications */}
        <DoctorsSection 
          onOpenBooking={() => handleOpenBooking()}
          doctorPortraitImage={doctorPortraitImg}
        />

        {/* Section 8: True clinical photo gallery & full lightbox previews */}
        <React.Suspense fallback={<div className="py-12 text-center text-slate-400">جاري تحميل الصور والعيادة...</div>}>
          <ClinicGallery />
        </React.Suspense>

        {/* Section 9: Verified patient testimonials carousel */}
        <React.Suspense fallback={<div className="py-12 text-center text-slate-400">جاري تحميل الآراء...</div>}>
          <Testimonials />
        </React.Suspense>

        {/* Section 9b: Interactive Oral Health & Emergency Tips Hub */}
        <React.Suspense fallback={<div className="py-12 text-center text-slate-400">جاري تحميل النصائح...</div>}>
          <DentalTipsHub />
        </React.Suspense>

        {/* Section 10: General FAQs about comfort and booking */}
        <FAQSection />

      </main>

      {/* Modern dark slate interactive contact details footer */}
      <Footer 
        onOpenBooking={() => handleOpenBooking()}
        onOpenMyBookings={() => setMyBookingsOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
      />

      {/* Floating Call, WhatsApp, Scroll Progress & Sticky mobile buttons */}
      <FloatingControls onOpenBooking={() => handleOpenBooking()} />

      {/* INTERACTIVE POPUPS & DRAWERS */}
      
      <React.Suspense fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm text-white text-sm" role="dialog" aria-modal="true" aria-label="جاري التحميل">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex items-center gap-3 shadow-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-sky-400">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" strokeDasharray="16 6" />
            </svg>
            <span>جاري التحميل...</span>
          </div>
        </div>
      }>
        {/* Multi-step appointment scheduling modal */}
        {bookingModalOpen && (
          !dbReady ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white text-sm" role="dialog" aria-modal="true" aria-label="جاري الاتصال بقاعدة البيانات">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-sm text-center shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin text-sky-400">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" strokeDasharray="16 6" />
                </svg>
                <span className="font-bold text-base">جاري الاتصال بقاعدة البيانات</span>
                <p className="text-slate-400 text-xs">يرجى الانتظار ثانية واحدة لتجهيز العيادة السحابية وحجز موعدك...</p>
              </div>
            </div>
          ) : (
            <BookingModal 
              isOpen={bookingModalOpen}
              onClose={() => setBookingModalOpen(false)}
              onBookingSuccess={handleBookingSuccess}
              initialServiceId={preselectedServiceId}
            />
          )
        )}

        {/* Saved bookings list viewer slide-drawer */}
        {myBookingsOpen && (
          !dbReady ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white text-sm" role="dialog" aria-modal="true" aria-label="جاري الاتصال بقاعدة البيانات">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-sm text-center shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin text-sky-400">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" strokeDasharray="16 6" />
                </svg>
                <span className="font-bold text-base">جاري الاتصال بقاعدة البيانات</span>
                <p className="text-slate-400 text-xs">يرجى الانتظار ثانية واحدة لمزامنة سجلات حجز موعدك...</p>
              </div>
            </div>
          ) : (
            <MyBookings 
              isOpen={myBookingsOpen}
              onClose={() => setMyBookingsOpen(false)}
              triggerRefresh={refreshTrigger}
              onOpenBooking={() => {
                setMyBookingsOpen(false);
                handleOpenBooking();
              }}
              onOpenAdmin={() => {
                setMyBookingsOpen(false);
                setAdminOpen(true);
              }}
            />
          )
        )}

        {/* Clinic Admin Dashboard Panel */}
        {adminOpen && (
          !dbReady ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white text-sm" role="dialog" aria-modal="true" aria-label="جاري الاتصال بقاعدة البيانات">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-sm text-center shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin text-sky-400">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" strokeDasharray="16 6" />
                </svg>
                <span className="font-bold text-base">جاري الاتصال بقاعدة البيانات</span>
                <p className="text-slate-400 text-xs">يرجى الانتظار ثانية واحدة لتأمين لوحة الإدارة وسجلات المرضى...</p>
              </div>
            </div>
          ) : (
            <AdminDashboard 
              isOpen={adminOpen}
              onClose={() => setAdminOpen(false)}
              triggerRefresh={refreshTrigger}
              onDataChanged={() => setRefreshTrigger(prev => !prev)}
            />
          )
        )}
      </React.Suspense>

    </div>
  );
}
