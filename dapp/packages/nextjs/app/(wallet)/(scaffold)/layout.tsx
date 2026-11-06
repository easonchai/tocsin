import "@scaffold-ui/components/styles.css";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import "~~/styles/globals.css";

// Tailwind, DaisyUI and the scaffold-ui preflight stay on the scaffold's own route: harness.
const ScaffoldLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="relative flex flex-col flex-1">{children}</main>
      <Footer />
    </div>
  );
};

export default ScaffoldLayout;
