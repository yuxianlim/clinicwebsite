import Nav from './components/Nav';
import Hero from './components/Hero';
import Services from './components/Services';
import About from './components/About';
import Testimonials from './components/Testimonials';
import Location from './components/Location';
import Footer from './components/Footer';

export default function Home() {
  return (
    <div>
      <Nav />
      <Hero />
      <Services />
      <About />
      <Testimonials />
      <Location />
      <Footer />
    </div>
  );
}
