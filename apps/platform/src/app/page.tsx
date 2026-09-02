import { ArrowUpRight } from '@phosphor-icons/react/ssr';
import Image from 'next/image';
import Link from 'next/link';

import callIllustration from '@/assets/login animation.svg';
import loginBackground from '@/assets/loging  background.webp';
import supernizoLogo from '@/assets/logo-transparent.png';

import styles from './landing-page.module.css';

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <Image
        alt=""
        className={styles.backgroundImage}
        fill
        priority
        sizes="100vw"
        src={loginBackground}
      />
      <div aria-hidden="true" className={styles.backgroundOverlay} />

      <header className={styles.header}>
        <Link aria-label="Supernizo Autocall home" className={styles.logoLink} href="/">
          <Image alt="Supernizo Autocall" className={styles.logo} priority src={supernizoLogo} />
        </Link>

        <Link className={styles.headerAction} href="/login">
          Get started
          <ArrowUpRight aria-hidden="true" size={18} weight="bold" />
        </Link>
      </header>

      <section className={styles.hero}>
        <h1>
          Meet your live
          <br />
          visitor coworker.
        </h1>
      </section>

      <div className={styles.illustrationWrap}>
        <Image
          alt="A friendly support specialist ready to connect with a website visitor"
          className={styles.illustration}
          priority
          src={callIllustration}
          unoptimized
        />
      </div>
    </main>
  );
}
