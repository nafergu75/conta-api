import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ProblemAgitationSolutionSection from '@/components/ProblemAgitationSolutionSection';
import SocialProofSection from '@/components/SocialProofSection';
import FeatureGrid from '@/components/FeatureGrid';
import IntegrationsSection from '@/components/IntegrationsSection';
import PricingSection from '@/components/PricingSection';
import FinalCTASection from '@/components/FinalCTASection';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <ProblemAgitationSolutionSection />
        <SocialProofSection />
        <FeatureGrid />
        <IntegrationsSection />
        <PricingSection />
        <FinalCTASection />
      </main>
      <Footer />
    </>
  );
}
