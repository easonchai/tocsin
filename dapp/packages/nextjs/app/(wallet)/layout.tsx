import "@rainbow-me/rainbowkit/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Tocsin demo board",
  description: "One button per scenario. The wallet checks each transaction against the threat flag log.",
});

// wagmi, RainbowKit and react-query load only under this group, so / and /claim stay light.
const WalletLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider enableSystem>
      <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
    </ThemeProvider>
  );
};

export default WalletLayout;
