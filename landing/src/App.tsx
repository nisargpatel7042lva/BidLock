import { Cursor } from './components/Cursor';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { MarqueeSection } from './components/MarqueeSection';
import { ProblemSection } from './components/ProblemSection';
import { ProtocolSection } from './components/ProtocolSection';
import { TechSection } from './components/TechSection';
import { StatsSection } from './components/StatsSection';
import { CTASection } from './components/CTASection';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <>
      <Cursor />
      <Navbar />
      <HeroSection />
      <MarqueeSection />
      <ProblemSection />
      <ProtocolSection />
      <TechSection />
      <StatsSection />
      <CTASection />
      <Footer />
    </>
  );
}
