import { useCallback, useEffect, useState } from "react";
import "./LandingPage.css";

import aaveLogo      from "../assets/brands/aave.png";
import uniswapLogo   from "../assets/brands/uniswap.png";
import morphoLogo    from "../assets/brands/morpho.png";
import aerodromeLogo from "../assets/brands/aerodrome.png";
import baseLogo      from "../assets/brands/base.png";
import celoLogo      from "../assets/brands/celo.png";
import minipayLogo   from "../assets/brands/minipay.png";

type SectionId = "product" | "how-it-works" | "features" | "pricing" | "faq";

interface LandingPageProps {
  onUsePanik: () => void;
}

interface CrisisStat {
  date: string;
  value: string;
  note: string;
}

interface StepCard {
  step: string;
  icon: string;
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

const SECTION_IDS: Record<SectionId, string> = {
  product:        "landing-product",
  "how-it-works": "landing-how-it-works",
  features:       "landing-features",
  pricing:        "landing-pricing",
  faq:            "landing-faq",
};

const NAV_LINKS: Array<{ label: string; section: SectionId }> = [
  { label: "How It Works", section: "how-it-works" },
  { label: "Features",     section: "features" },
  { label: "FAQ",          section: "faq" },
];

const HERO_LOGOS: Array<{ name: string; src: string }> = [
  { name: "Aave",      src: aaveLogo      },
  { name: "Uniswap",   src: uniswapLogo   },
  { name: "Morpho",    src: morphoLogo    },
  { name: "Aerodrome", src: aerodromeLogo },
  { name: "Base",      src: baseLogo      },
  { name: "Celo",      src: celoLogo      },
  { name: "MiniPay",   src: minipayLogo   },
];

const CRISIS_STATS: CrisisStat[] = [
  {
    date: "MAY 2021",
    value: "$662M",
    note: "In DeFi Liquidations Within 24 Hours. Gas Spiked To 1,500+ Gwei — $500 Per Tx.",
  },
  {
    date: "NOV 2022 · FTX COLLAPSE",
    value: "$20.7B",
    note: "Fled Centralized Exchanges In 11 Days. DeFi Users Rushed To Manage Positions With No Unified Exit Tool.",
  },
  {
    date: "MAR 2023 · USDC DEPEG",
    value: "3,400",
    note: "Aave Liquidations In Hours. USDC Fell To $0.87 In 5 Hours. DEXs Hit $25B Single-Day Volume.",
  },
];

const STEP_CARDS: StepCard[] = [
  {
    step: "01",
    icon: "▣",
    title: "Connect Wallet",
    description:
      "Connect Via Coinbase Smart Wallet, MetaMask, Or WalletConnect. Panik Automatically Scans All Open Positions Across Supported Protocols On Base.",
  },
  {
    step: "02",
    icon: "⊞",
    title: "Review Positions",
    description:
      "See Health Factor, Lock Status, And Route Readiness In One Place Before You Sign. Select All Or Only What Matters Now.",
  },
  {
    step: "03",
    icon: "⇥",
    title: "Exit Everything",
    description:
      "Execute One Atomic Transaction That Repays Debt, Unwinds LPs, Swaps To USDC, And Reverts Fully On Failure.",
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How does atomic execution protect me?",
    answer:
      "PAN!K executes repayment, unwinds, and swaps in one transaction. If any step fails, the whole transaction reverts so your state stays unchanged.",
  },
  {
    question: "What protocols does PAN!K support?",
    answer:
      "This build focuses on Aave V3 positions and Uniswap V3 LP positions on Base Sepolia, matching the current simulator workflow.",
  },
  {
    question: "Can I exit specific positions instead of everything?",
    answer:
      "Yes. Partial exit lets you choose exactly which eligible positions to include while keeping one atomic confirmation path.",
  },
  {
    question: "What happens if I have locked or vested positions?",
    answer:
      "Locked or ineligible positions are marked during scan and excluded from execution. PAN!K only submits what can be exited safely.",
  },
  {
    question: "How are gas fees calculated?",
    answer:
      "Gas is estimated before you confirm based on current network conditions. PAN!K bundles all steps into one transaction, so you pay one gas fee rather than multiple separate ones.",
  },
  {
    question: "What if the market moves between preview and execution?",
    answer:
      "Final execution still runs contract checks at submit time. If conditions break assumptions, the transaction reverts to prevent partial outcomes.",
  },
  {
    question: "Does PAN!K hold my assets at any point?",
    answer:
      "No. PAN!K is non-custodial. You sign transactions from your wallet and maintain control through the entire process.",
  },
];

function useReducedMotionPreference() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

export function LandingPage({ onUsePanik }: LandingPageProps) {
  const prefersReducedMotion = useReducedMotionPreference();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = useCallback(
    (section: SectionId) => {
      const target = document.getElementById(SECTION_IDS[section]);
      if (!target) return;
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    },
    [prefersReducedMotion]
  );

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;

    if (prefersReducedMotion) {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-visible");
          obs.unobserve(e.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [prefersReducedMotion]);

  return (
    <div className="lp-root">
      {/* ── NAV ── */}
      <header className={`lp-nav-wrap ${isScrolled ? "is-scrolled" : ""}`}>
        <div className="lp-nav">
          <button className="lp-wordmark" onClick={() => scrollToSection("product")}>
            PAN!K
          </button>
          <nav className="lp-nav-links" aria-label="Landing sections">
            {NAV_LINKS.map((link) => (
              <button key={link.section} className="lp-nav-link" onClick={() => scrollToSection(link.section)}>
                {link.label}
              </button>
            ))}
          </nav>
          <button className="lp-btn lp-btn-connect" onClick={onUsePanik}>
            Connect wallet
          </button>
        </div>
      </header>

      <main className="lp-main">
        {/* ── HERO ── */}
        <section className="lp-hero" id={SECTION_IDS.product}>
          <div className="lp-hero-glow" aria-hidden="true" />
          <div className="lp-hero-content" data-reveal>

            <h1>
              ONE BUTTON.
              <br />
              <span>TOTAL EXIT.</span>
            </h1>
            <p className="lp-hero-copy">
              Exit all your DeFi positions across multiple protocols in a single{" "}
              <strong>atomic transaction</strong>. Convert everything to USDC instantly when market
              conditions demand speed.
            </p>
            <div className="lp-hero-actions">
              <button className="lp-btn lp-btn-primary" onClick={onUsePanik}>
                Use Pan!k &nbsp;›
              </button>
              <button className="lp-btn lp-btn-secondary" onClick={() => scrollToSection("how-it-works")}>
                See How It Works
              </button>
            </div>
            <p className="lp-hero-note">Non-custodial • Atomic execution • Full transaction control</p>
          </div>

          <div className="lp-logo-marquee" aria-label="Supported protocols" data-reveal>
            <div className="lp-logo-track">
              {[
                ...HERO_LOGOS,
                ...HERO_LOGOS,
                ...HERO_LOGOS,
                ...HERO_LOGOS,
                ...HERO_LOGOS,
                ...HERO_LOGOS,
                ...HERO_LOGOS,
                ...HERO_LOGOS,
              ].map((logo, i) => (
                <span className={`lp-logo-chip lp-logo-${logo.name.toLowerCase()}`} key={`${logo.name}-${i}`}>
                  <img src={logo.src} alt={logo.name} draggable={false} />
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── PROBLEM ── */}
        <section className="lp-section lp-problem" data-reveal>
          <div className="lp-section-head">
            <p className="lp-overline">The Problem Is Real</p>
            <h2>Markets Don't Wait For You</h2>
            <p>
              Three historic crises. One pattern: DeFi users who couldn't exit fast enough paid the
              price. Manual exits take 15–30 minutes. Crisis windows close in seconds.
            </p>
          </div>
          <div className="lp-problem-grid">
            {CRISIS_STATS.map((stat, index) => (
              <article
                className="lp-problem-card"
                key={stat.date}
                data-reveal
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <p className="lp-problem-date">{stat.date}</p>
                <p className="lp-problem-value">{stat.value}</p>
                <p className="lp-problem-note">{stat.note}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="lp-section lp-steps" id={SECTION_IDS["how-it-works"]}>
          <div className="lp-section-head" data-reveal>
            <p className="lp-overline">How It Works</p>
            <h2>Three Steps To Safety</h2>
          </div>
          <div className="lp-steps-grid">
            {STEP_CARDS.map((step, index) => (
              <article
                className="lp-step-card"
                key={step.step}
                data-reveal
                style={{ transitionDelay: `${index * 120}ms` }}
              >
                <p className="lp-step-index">{step.step}/</p>
                <div className="lp-step-icon" aria-hidden="true">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {index < STEP_CARDS.length - 1 && (
                  <span className="lp-step-arrow" aria-hidden="true">›</span>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ── CORE FEATURES ── */}
        <section className="lp-section lp-features" id={SECTION_IDS.features}>
          <div className="lp-section-head" data-reveal>
            <p className="lp-overline">Core Features</p>
            <h2>Built For The Crash,<br />Not The Calm</h2>
          </div>

          {/* Dashboard card — full width */}
          <div className="lp-feat-dashboard" data-reveal>
            <div className="lp-feat-dashboard-left">
              <p className="lp-feat-tag orange">Real-Time Monitoring</p>
              <h3>Position Health Dashboard</h3>
              <p>
                Know Your Risk At All Times — Not Just When Things Break. Health Factor Per Position,
                Liquidation Price, And Time-To-Liquidation Based On Current Price Trajectory. The
                Reason To Open Panik Every Day, Not Just In A Crisis.
              </p>
              <div className="lp-feat-metrics">
                <div className="lp-feat-metric">
                  <span>Health Factor</span>
                  <strong>1.42</strong>
                </div>
                <div className="lp-feat-metric">
                  <span>Liquidation Price</span>
                  <strong>$1,840</strong>
                </div>
                <div className="lp-feat-metric">
                  <span>Est. Time-To-Liq</span>
                  <strong style={{ color: "var(--orange)" }}>4H 12M</strong>
                </div>
              </div>
            </div>

            <div className="lp-feat-dashboard-right">
              <table className="lp-dash-table">
                <thead>
                  <tr>
                    <th>Protocol</th>
                    <th>Asset</th>
                    <th>Value</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="lp-dot lp-dot-blue" />Aave</td>
                    <td>USDT</td>
                    <td>$4,200</td>
                    <td className="lp-health-warn">1.42</td>
                  </tr>
                  <tr>
                    <td><span className="lp-dot lp-dot-purple" />Uniswap</td>
                    <td>WETH</td>
                    <td>$1,850</td>
                    <td className="lp-health-ok">2.81</td>
                  </tr>
                  <tr>
                    <td><span className="lp-dot lp-dot-teal" />Aerodrome</td>
                    <td>ETH</td>
                    <td>$990</td>
                    <td className="lp-health-crit">1.08</td>
                  </tr>
                </tbody>
              </table>
              <button className="lp-dash-exit-btn" onClick={onUsePanik}>
                EXIT ALL POSITIONS →
              </button>
            </div>
          </div>

          {/* Two sub-cards */}
          <div className="lp-feat-row">
            {/* Atomic Execution */}
            <div className="lp-feat-card" data-reveal>
              <p className="lp-feat-tag green">On-Chain Safety</p>
              <h3>Atomic Execution</h3>
              <p>
                Every Step Executes In One Transaction. Debt Repaid Before Collateral Touched. LP
                Tokens Burned, Fees Collected. If Anything Reverts — You Lose Nothing. No Partial
                Exits. No Stuck State.
              </p>
              <ul className="lp-atomic-list">
                {[
                  ["Repay Debt First",        "Enforced",   false],
                  ["Remove LP Positions",     "Enforced",   false],
                  ["Swap All To USDC",        "Enforced",   false],
                  ["Revert If Any Step Fails","Guaranteed", true ],
                ].map(([label, status, isGreen]) => (
                  <li key={label as string}>
                    <span><span className="lp-atomic-check">✓</span>{label as string}</span>
                    <span className={`lp-atomic-status${isGreen ? " guaranteed" : ""}`}>{status as string}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Partial Exit */}
            <div className="lp-feat-card" data-reveal style={{ transitionDelay: "80ms" }}>
              <p className="lp-feat-tag green">Precision Control</p>
              <h3>Partial Exit</h3>
              <p>
                Don't Want To Exit Everything? Toggle Individual Positions On Or Off. Running USDC
                Total Updates In Real Time. Same Atomic Logic — Only Selected Positions Are Touched.
              </p>
              <div className="lp-partial-mock">
                {[
                  ["Aave • DAI",        "Supply + Borrow", "exit"],
                  ["Aerodrome • AERO/ETH", "LP",           "flash"],
                  ["Morpho • USDC",     "Supply",          "exit"],
                ].map(([name, type, badge]) => (
                  <div className="lp-partial-item" key={name as string}>
                    <div className="lp-partial-item-left">
                      <div className="lp-partial-item-name">{name as string}</div>
                      <div className="lp-partial-item-type">{type as string}</div>
                    </div>
                    <span className={`lp-partial-badge ${badge as string}`}>
                      {badge === "exit" ? "✓ Can exit" : "⚡ Flash loan required"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── GUARANTEE ── */}
        <section className="lp-section lp-guarantee" data-reveal>
          <div className="lp-section-head">
            <p className="lp-overline">The Guarantee</p>
            <h2>
              ONE TRANSACTION.<br />
              ZERO PARTIAL STATES.
            </h2>
            <p>
              No protocol in DeFi today lets you exit all positions across multiple protocols, in the
              correct sequence, in a single atomic transaction. Panik does. And if anything fails,
              the entire transaction reverts — you never end up stuck between debt and collateral.
            </p>
          </div>
          <div className="lp-orb-shell" aria-hidden="true">
            <div className="lp-orb-core" />
            <span>PAN!K</span>
          </div>
        </section>



        {/* ── FINAL CTA ── */}
        <section className="lp-section lp-final-cta" data-reveal>
          <div className="lp-section-head">
            <p className="lp-overline">The Guarantee</p>
            <h2>
              GET OUT BEFORE<br />
              <span>IT'S TOO LATE.</span>
            </h2>
            <p>
              The market doesn't care about your exit queue. Panik does. One transaction. Total exit.
              Every time.
            </p>
          </div>
          <div className="lp-hero-actions">
            <button className="lp-btn lp-btn-primary" onClick={onUsePanik}>
              Use Pan!k &nbsp;›
            </button>
            <button className="lp-btn lp-btn-secondary" onClick={() => scrollToSection("faq")}>
              Read the Docs
            </button>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="lp-section lp-faq" id={SECTION_IDS.faq}>
          <div className="lp-section-head" data-reveal>
            <p className="lp-overline">Common Questions</p>
            <h2>Common Questions</h2>
            <p>Clear answers about how PAN!K works and what to expect during execution.</p>
          </div>

          <div className="lp-faq-list" data-reveal>
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <article className={`lp-faq-item ${isOpen ? "is-open" : ""}`} key={item.question}>
                  <button
                    className="lp-faq-button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIndex((prev) => (prev === index ? null : index))}
                  >
                    <span>{item.question}</span>
                    <span className="lp-faq-icon" aria-hidden="true">⌄</span>
                  </button>
                  <div className="lp-faq-answer">
                    <div><p>{item.answer}</p></div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <p className="lp-footer-brand">PAN!K</p>
          <p className="lp-footer-copy">
            One button. Total exit. Built on Base.{" "}
            <span style={{ opacity: 0.5 }}>&copy; {new Date().getFullYear()} Panik. All rights reserved.</span>
          </p>
          <div className="lp-footer-links">
            {(["Docs", "Github", "Twitter", "Terms"] as const).map((label) => (
              <button key={label} onClick={() => scrollToSection("product")}>{label}</button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}