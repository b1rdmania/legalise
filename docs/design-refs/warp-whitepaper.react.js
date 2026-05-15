import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const customStyles = {
  body: {
    color: '#181818',
    backgroundColor: '#FFFFFF',
    WebkitFontSmoothing: 'antialiased',
  },
  proseP: {
    color: '#4b5563',
    lineHeight: '1.7',
    marginBottom: '1.5rem',
  },
  codeBlock: {
    background: '#f9f9f9',
    border: '1px solid #E5E5E5',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    padding: '1.5rem',
    margin: '2rem 0',
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  tocLinkActive: {
    color: '#181818',
    borderLeftColor: '#181818',
    fontWeight: '600',
  },
};

const GithubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
    <path d="M9 18c-4.51 2-5-2-7-2"/>
  </svg>
);

const FileTextIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
    <path d="M10 9H8"/>
    <path d="M16 13H8"/>
    <path d="M16 17H8"/>
  </svg>
);

const WarpLogo = () => (
  <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#181818]">
    <path d="M4 8L16 32L20 20L24 32L36 8L28 8L20 24L12 8H4Z" fill="currentColor" />
  </svg>
);

const Header = () => {
  return (
    <header className="fixed top-0 w-full z-50 bg-white border-b border-[#E5E5E5]">
      <div className="max-w-[1440px] mx-auto px-6 h-[80px] flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 group outline-none">
          <WarpLogo />
          <span className="font-bold text-lg tracking-tight text-[#181818] mt-0.5">WARP</span>
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#181818]">
          <a href="#" className="hover:text-[#bfbfbf] transition-colors">Technology</a>
          <a href="#" className="hover:text-[#bfbfbf] transition-colors">Products</a>
          <a href="#" className="bg-[#181818] text-white px-4 py-2 hover:bg-black transition-colors">Contact Us</a>
        </nav>
      </div>
    </header>
  );
};

const TOCLink = ({ href, label, isActive, onClick, isSubItem }) => {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`py-2 border-l-2 text-sm transition-all ${isSubItem ? 'pl-8 text-xs' : 'pl-4'} ${
        isActive
          ? 'border-[#181818] text-[#181818] font-semibold'
          : 'border-transparent text-gray-500 hover:text-[#181818]'
      }`}
      style={isActive ? customStyles.tocLinkActive : {}}
    >
      {label}
    </a>
  );
};

const Sidebar = ({ activeSection, onNavClick }) => {
  const tocItems = [
    { href: '#abstract', label: '01. Abstract', id: 'abstract' },
    { href: '#problem', label: '02. Problem Space', id: 'problem' },
    { href: '#architecture', label: '03. Core Architecture', id: 'architecture' },
    { href: '#state-channels', label: '3.1 State Channels', id: 'state-channels', isSubItem: true },
    { href: '#plasma-chains', label: '3.2 Plasma Subnets', id: 'plasma-chains', isSubItem: true },
    { href: '#security', label: '04. Security Guarantees', id: 'security' },
    { href: '#implementation', label: '05. Implementation', id: 'implementation' },
    { href: '#conclusion', label: '06. Conclusion', id: 'conclusion' },
  ];

  return (
    <aside className="w-80 hidden lg:block sticky top-[80px] h-[calc(100vh-80px)] border-r border-[#E5E5E5] p-10 overflow-y-auto">
      <div className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase mb-8">
        Documentation
      </div>
      <nav className="flex flex-col gap-1">
        {tocItems.map((item) => (
          <TOCLink
            key={item.id}
            href={item.href}
            label={item.label}
            isActive={activeSection === item.id}
            isSubItem={item.isSubItem}
            onClick={(e) => {
              e.preventDefault();
              onNavClick(item.id);
            }}
          />
        ))}
      </nav>

      <div className="mt-12 pt-8 border-t border-[#E5E5E5]">
        <div className="text-[10px] font-bold tracking-[0.1em] text-gray-400 uppercase mb-4">Resources</div>
        <ul className="flex flex-col gap-3 text-sm">
          <li>
            <a href="#" className="flex items-center gap-2 hover:text-gray-500">
              <GithubIcon /> GitHub Repository
            </a>
          </li>
          <li>
            <a href="#" className="flex items-center gap-2 hover:text-gray-500">
              <FileTextIcon /> PDF Version
            </a>
          </li>
        </ul>
      </div>
    </aside>
  );
};

const CodeBlock = ({ children }) => (
  <div style={customStyles.codeBlock}>{children}</div>
);

const MainContent = ({ sectionRefs }) => {
  return (
    <main className="flex-1 p-6 md:p-16 lg:p-24 bg-white max-w-4xl mx-auto">
      <div className="mb-16">
        <div className="text-xs font-mono text-gray-400 mb-4">VERSION 2.1.0 — FEB 2026</div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[#181818] mb-6" style={{ letterSpacing: '-0.02em' }}>
          Warp Engine: Recursive Scaling via Off-Chain State Resolution
        </h1>
        <p className="text-xl text-gray-500 leading-relaxed max-w-2xl">
          A technical framework for hyper-scalable decentralized systems utilizing off-chain routing and hierarchical Plasma rollups.
        </p>
        <div className="flex gap-8 mt-10 pb-10 border-b border-[#E5E5E5]">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Author</div>
            <div className="text-sm font-semibold">Joseph Poon</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Topic</div>
            <div className="text-sm font-semibold">Infrastructural Scaling</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</div>
            <div className="text-sm font-semibold text-green-600">Peer Reviewed</div>
          </div>
        </div>
      </div>

      <section id="abstract" ref={sectionRefs.abstract} className="mb-24">
        <h2 className="text-2xl font-bold mb-6" style={{ letterSpacing: '-0.02em', color: '#181818' }}>01. Abstract</h2>
        <p style={customStyles.proseP}>
          Current Layer-1 and Layer-2 architectures are limited by the linear nature of block production. Warp Engine introduces a multi-layered approach that separates transaction execution from global consensus. By utilizing bidirectional state channels for instant settlement and hierarchical Plasma chains for batch data availability, Warp achieves throughput parity with centralized systems while maintaining the security properties of the underlying settlement layer.
        </p>
      </section>

      <section id="problem" ref={sectionRefs.problem} className="mb-24">
        <h2 className="text-2xl font-bold mb-6" style={{ letterSpacing: '-0.02em', color: '#181818' }}>02. Problem Space</h2>
        <p style={customStyles.proseP}>
          The fundamental constraint of decentralized systems is the <em>Scalability Trilemma</em>. As network usage grows, the cost of participation (running a node) increases, leading to centralization. Current optimistic and zero-knowledge rollups improve this but are still bottlenecked by L1 data availability costs.
        </p>
        <div className="bg-[#F4F4F4] p-8 border-l-4 border-[#181818] my-8">
          <p className="text-sm font-medium italic m-0" style={{ color: '#4b5563' }}>
            "If every transaction must be seen by every node in the network, the network can never scale beyond the capacity of a single node."
          </p>
        </div>
      </section>

      <section id="architecture" ref={sectionRefs.architecture} className="mb-24">
        <h2 className="text-2xl font-bold mb-6" style={{ letterSpacing: '-0.02em', color: '#181818' }}>03. Core Architecture</h2>
        <p style={customStyles.proseP}>
          The Warp architecture functions as a "Network of Networks." It consists of three distinct layers of resolution:
        </p>

        <h3 id="state-channels" ref={sectionRefs['state-channels']} className="text-lg font-bold mt-10 mb-4" style={{ letterSpacing: '-0.02em', color: '#181818' }}>
          3.1 Bidirectional State Channels
        </h3>
        <p style={customStyles.proseP}>
          Warp utilizes the HTLC (Hash Time-Locked Contract) primitive to route payments across a web of interconnected nodes. This allows for millisecond finality without any on-chain interaction for individual transactions.
        </p>

        <CodeBlock>{`// Sample HTLC Construction for Warp Routing
struct WarpHTLC {
    bytes32 hashlock;
    uint256 amount;
    uint256 expiration;
    address recipient;
    address sender;
}

function lockFunds(bytes32 _hashlock, uint256 _expiry) external payable {
    require(msg.value > 0, "Amount must be > 0");
    // State logic for off-chain channel update...
}`}</CodeBlock>

        <h3 id="plasma-chains" ref={sectionRefs['plasma-chains']} className="text-lg font-bold mt-10 mb-4" style={{ letterSpacing: '-0.02em', color: '#181818' }}>
          3.2 Hierarchical Plasma Subnets
        </h3>
        <p style={customStyles.proseP}>
          For complex logic that cannot be captured in simple payment channels, Warp deploys application-specific Plasma chains. These chains submit Merkle roots to the parent chain, ensuring that users can always exit their funds even if the Plasma operator turns malicious.
        </p>
      </section>

      <section id="security" ref={sectionRefs.security} className="mb-24">
        <h2 className="text-2xl font-bold mb-6" style={{ letterSpacing: '-0.02em', color: '#181818' }}>04. Security Guarantees</h2>
        <p style={customStyles.proseP}>
          Security in Warp is enforced through <em>Fraud Proofs</em>. Any participant can challenge a malicious state transition on the parent chain. If the operator fails to provide a valid proof within the challenge window, the state is reverted and the operator's bond is slashed.
        </p>
        <ul className="list-none space-y-4 text-gray-600 text-sm pl-0">
          <li className="flex items-start gap-4">
            <span className="font-bold text-[#181818]">—</span>
            <span><strong>Data Availability:</strong> Operators must provide proof of data availability before a root is finalized.</span>
          </li>
          <li className="flex items-start gap-4">
            <span className="font-bold text-[#181818]">—</span>
            <span><strong>Exit Games:</strong> Users can initiate an "Exit" to pull assets from a dead or malicious sub-chain back to L1.</span>
          </li>
        </ul>
      </section>

      <section id="implementation" ref={sectionRefs.implementation} className="mb-24">
        <h2 className="text-2xl font-bold mb-6" style={{ letterSpacing: '-0.02em', color: '#181818' }}>05. Implementation</h2>
        <p style={customStyles.proseP}>
          The implementation roadmap for Warp Engine is divided into three phases. Phase one focuses on establishing the core state channel network, enabling bilateral payment routing with HTLC primitives. Phase two introduces the Plasma subnet deployment framework, allowing dApp developers to launch their own application-specific chains anchored to the Warp settlement layer.
        </p>
        <p style={customStyles.proseP}>
          Phase three completes the recursive architecture by enabling Plasma chains to host their own sub-channels, achieving true hierarchical scaling. Each layer inherits the security guarantees of the layer below it, culminating in L1-grade security for even the deepest nested transactions.
        </p>
      </section>

      <section id="conclusion" ref={sectionRefs.conclusion} className="mb-24">
        <h2 className="text-2xl font-bold mb-6" style={{ letterSpacing: '-0.02em', color: '#181818' }}>06. Conclusion</h2>
        <p style={customStyles.proseP}>
          Warp Engine demonstrates that scalability and decentralization are not mutually exclusive. By separating transaction execution from consensus and leveraging hierarchical off-chain resolution, the system achieves throughput comparable to centralized alternatives without compromising on security or censorship resistance.
        </p>
        <p style={customStyles.proseP}>
          The recursive nature of the architecture ensures that as adoption grows, the system scales horizontally rather than placing additional burden on the base layer. Future work will focus on cross-chain interoperability and formal verification of the fraud proof system.
        </p>
      </section>

      <footer className="mt-32 pt-12 border-t border-[#E5E5E5] flex justify-between items-center text-xs text-gray-400 uppercase tracking-widest">
        <span>© 2026 Warp Engine Corp</span>
        <div className="flex gap-6">
          <a href="#" className="hover:text-[#181818]">Privacy</a>
          <a href="#" className="hover:text-[#181818]">Terms</a>
          <a href="#" className="hover:text-[#181818]">Contact</a>
        </div>
      </footer>
    </main>
  );
};

const WhitepaperPage = () => {
  const [activeSection, setActiveSection] = useState('abstract');

  const sectionRefs = {
    abstract: useRef(null),
    problem: useRef(null),
    architecture: useRef(null),
    'state-channels': useRef(null),
    'plasma-chains': useRef(null),
    security: useRef(null),
    implementation: useRef(null),
    conclusion: useRef(null),
  };

  useEffect(() => {
    const handleScroll = () => {
      const sectionIds = ['abstract', 'problem', 'architecture', 'state-channels', 'plasma-chains', 'security', 'implementation', 'conclusion'];
      let current = 'abstract';

      for (const id of sectionIds) {
        const el = sectionRefs[id].current;
        if (el) {
          const top = el.getBoundingClientRect().top;
          if (top <= 120) {
            current = id;
          }
        }
      }

      setActiveSection(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (sectionId) => {
    const el = sectionRefs[sectionId].current;
    if (el) {
      const offsetTop = el.getBoundingClientRect().top + window.pageYOffset - 100;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      setActiveSection(sectionId);
    }
  };

  return (
    <div style={customStyles.body} className="font-sans">
      <Header />
      <div className="max-w-[1440px] mx-auto flex pt-[80px]">
        <Sidebar activeSection={activeSection} onNavClick={handleNavClick} />
        <MainContent sectionRefs={sectionRefs} />
      </div>
    </div>
  );
};

const App = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      body { margin: 0; padding: 0; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <Router basename="/">
      <Routes>
        <Route path="/" element={<WhitepaperPage />} />
      </Routes>
    </Router>
  );
};

export default App;