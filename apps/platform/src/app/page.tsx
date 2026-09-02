import {
  ArrowRight,
  ChatsCircle,
  Check,
  Clock,
  CursorClick,
  GlobeHemisphereWest,
  MapPin,
  PhoneCall,
  Sparkle,
  TrendUp,
  UsersThree,
} from '@phosphor-icons/react/ssr';
import Image from 'next/image';
import Link from 'next/link';

import callIllustration from '@/assets/login animation.svg';
import heroBackground from '@/assets/loging  background1.webp';
import supernizoLogo from '@/assets/logo-transparent.png';

import styles from './landing-page.module.css';

const features = [
  {
    icon: GlobeHemisphereWest,
    eyebrow: 'Live intent',
    title: 'See the moment that matters.',
    description:
      'Know who is browsing, what caught their attention, and when they are ready for a conversation.',
  },
  {
    icon: PhoneCall,
    eyebrow: 'Browser calls',
    title: 'Go from signal to hello.',
    description:
      'Invite high-intent visitors into a clear audio or video call—right in the browser, with no download.',
  },
  {
    icon: ChatsCircle,
    eyebrow: 'Human context',
    title: 'Start every chat informed.',
    description:
      'Give your team the visitor journey and live context they need to make every opening feel personal.',
  },
] as const;

const steps = [
  {
    number: '01',
    title: 'Spot the signal',
    description: 'See active visitors and their journey unfold in real time.',
  },
  {
    number: '02',
    title: 'Make it personal',
    description: 'Reach out with a timely message or a browser call invitation.',
  },
  {
    number: '03',
    title: 'Turn interest into action',
    description: 'Resolve questions while intent is high and keep the relationship moving.',
  },
] as const;

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Image
          alt=""
          className={styles.heroTexture}
          fill
          priority
          sizes="100vw"
          src={heroBackground}
        />
        <div className={styles.heroGlow} />

        <header className={styles.header}>
          <Link aria-label="Supernizo Autocall home" className={styles.logoLink} href="/">
            <Image alt="Supernizo Autocall" className={styles.logo} priority src={supernizoLogo} />
          </Link>

          <nav aria-label="Main navigation" className={styles.nav}>
            <a href="#product">Product</a>
            <a href="#workflow">How it works</a>
            <a href="#about">Why Supernizo</a>
          </nav>

          <Link className={styles.headerCta} href="/login">
            Sign in
            <ArrowRight aria-hidden="true" size={15} weight="bold" />
          </Link>
        </header>

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrowPill}>
              <span className={styles.liveDot} />
              Meet visitors while they&apos;re here
            </div>

            <h1>
              Turn live traffic into <span>real conversation.</span>
            </h1>

            <p className={styles.heroLead}>
              See intent as it happens. Then chat, call, and help the right visitor at exactly the
              right moment.
            </p>

            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/login">
                Start connecting
                <ArrowRight aria-hidden="true" size={18} weight="bold" />
              </Link>
              <a className={styles.textButton} href="#workflow">
                See how it works
                <span aria-hidden="true">↓</span>
              </a>
            </div>

            <ul aria-label="Product highlights" className={styles.microBenefits}>
              <li>
                <Check aria-hidden="true" size={15} weight="bold" />
                No downloads
              </li>
              <li>
                <Check aria-hidden="true" size={15} weight="bold" />
                One-click calls
              </li>
              <li>
                <Check aria-hidden="true" size={15} weight="bold" />
                Live context
              </li>
            </ul>
          </div>

          <div
            className={styles.productVisual}
            aria-label="Supernizo live visitor dashboard preview"
          >
            <div className={styles.orbitOne} />
            <div className={styles.orbitTwo} />
            <div className={styles.dashboardCard}>
              <div className={styles.dashboardTopbar}>
                <div>
                  <span className={styles.overline}>Today&apos;s live pulse</span>
                  <strong>Visitor activity</strong>
                </div>
                <span className={styles.liveBadge}>
                  <span /> Live
                </span>
              </div>

              <div className={styles.metricGrid}>
                <div className={styles.metricCard}>
                  <div className={styles.metricIcon}>
                    <UsersThree aria-hidden="true" size={18} weight="duotone" />
                  </div>
                  <span>Visitors now</span>
                  <strong>24</strong>
                  <small>
                    <TrendUp aria-hidden="true" size={13} weight="bold" /> 18% this hour
                  </small>
                </div>
                <div className={styles.activityCard}>
                  <div className={styles.activityHeader}>
                    <span>Intent signal</span>
                    <strong>High</strong>
                  </div>
                  <div className={styles.bars} aria-hidden="true">
                    {[34, 46, 41, 63, 54, 78, 68, 92, 82, 100].map((height, index) => (
                      <span key={index} style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.visitorCard}>
                <div className={styles.visitorAvatar}>AM</div>
                <div className={styles.visitorIdentity}>
                  <strong>Alex Morgan</strong>
                  <span>
                    <MapPin aria-hidden="true" size={12} weight="fill" /> London, UK
                  </span>
                </div>
                <div className={styles.visitorTime}>
                  <Clock aria-hidden="true" size={13} /> 03:24
                </div>
              </div>

              <div className={styles.intentRow}>
                <div className={styles.intentLine}>
                  <span className={styles.intentIcon}>
                    <CursorClick aria-hidden="true" size={16} weight="duotone" />
                  </span>
                  <div>
                    <strong>Pricing page</strong>
                    <span>Viewed 3 times</span>
                  </div>
                </div>
                <span className={styles.intentScore}>92% intent</span>
              </div>
            </div>

            <div className={styles.callToast}>
              <span className={styles.callIcon}>
                <PhoneCall aria-hidden="true" size={21} weight="fill" />
              </span>
              <span>
                <small>Browser call</small>
                <strong>Ready to connect</strong>
              </span>
              <span className={styles.ringPulse} />
            </div>

            <div className={styles.messageToast}>
              <span className={styles.messageAvatar}>S</span>
              <span>
                <small>Supernizo</small>
                <strong>Perfect moment to say hello.</strong>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.heroFoot}>
          <span>One human conversation can change the whole journey.</span>
          <span className={styles.heroFootLine} />
          <span>Visitor intelligence · Chat · Browser calling</span>
        </div>
      </section>

      <section className={styles.statement} id="about">
        <div className={styles.sectionEyebrow}>
          <Sparkle aria-hidden="true" size={16} weight="fill" />
          The human layer
        </div>
        <h2>
          Your website doesn&apos;t need more noise.
          <br />
          It needs the <em>right hello.</em>
        </h2>
        <p>
          Supernizo turns anonymous browsing into a moment your team can act on—naturally,
          personally, and while interest is still warm.
        </p>
      </section>

      <section className={styles.featuresSection} id="product">
        <div className={styles.sectionIntro}>
          <div>
            <span className={styles.sectionKicker}>Built for the moment</span>
            <h2>From curiosity to connection.</h2>
          </div>
          <p>
            A calm, focused workspace for seeing intent and stepping in with the right kind of help.
          </p>
        </div>

        <div className={styles.featureGrid}>
          {features.map((feature, index) => {
            const Icon = feature.icon;

            return (
              <article className={styles.featureCard} key={feature.title}>
                <div className={styles.featureNumber}>0{index + 1}</div>
                <div className={styles.featureIcon}>
                  <Icon aria-hidden="true" size={26} weight="duotone" />
                </div>
                <span>{feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.workflowSection} id="workflow">
        <div className={styles.illustrationWrap}>
          <div className={styles.illustrationGlow} />
          <Image
            alt="A friendly support specialist ready to connect with a website visitor"
            className={styles.callIllustration}
            src={callIllustration}
            unoptimized
          />
          <div className={styles.illustrationTag}>
            <span className={styles.illustrationTagIcon}>
              <PhoneCall aria-hidden="true" size={16} weight="fill" />
            </span>
            <span>
              <small>Average time to connect</small>
              <strong>12 seconds</strong>
            </span>
          </div>
        </div>

        <div className={styles.workflowCopy}>
          <span className={styles.sectionKicker}>Simple by design</span>
          <h2>Three small steps. One meaningful connection.</h2>
          <div className={styles.steps}>
            {steps.map((step) => (
              <article className={styles.step} key={step.number}>
                <span>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <Image alt="" className={styles.ctaTexture} fill sizes="100vw" src={heroBackground} />
        <div className={styles.ctaGlow} />
        <div className={styles.ctaContent}>
          <span className={styles.sectionKicker}>Be there at the right moment</span>
          <h2>Make your next visitor feel seen.</h2>
          <p>Turn live intent into a real conversation with Supernizo Autocall.</p>
          <Link className={styles.primaryButton} href="/login">
            Open Supernizo
            <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <Image alt="Supernizo Autocall" className={styles.footerLogo} src={supernizoLogo} />
        <p>Live visitor intelligence, made human.</p>
        <div className={styles.footerLinks}>
          <a href="#product">Product</a>
          <a href="#workflow">How it works</a>
          <Link href="/login">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}
