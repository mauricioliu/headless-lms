import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { Architecture } from '@/components/landing/architecture'
import { SdkShowcase } from '@/components/landing/sdk-showcase'
import { AppsMcp } from '@/components/landing/apps-mcp'
import { Cta } from '@/components/landing/cta'
import { absoluteUrl, siteConfig } from '@/lib/site'
import { jsonLdProps } from '@/lib/structured-data'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': absoluteUrl('/#software'),
      name: siteConfig.name,
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Learning Management System',
      operatingSystem: 'Any',
      url: siteConfig.url,
      description: siteConfig.description,
      license: 'https://opensource.org/licenses/MIT',
      softwareHelp: absoluteUrl('/docs'),
      author: { '@id': absoluteUrl('/#organization') },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${siteConfig.githubUrl}#source`,
      name: siteConfig.name,
      description: siteConfig.description,
      codeRepository: siteConfig.githubUrl,
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Node.js',
      license: 'https://opensource.org/licenses/MIT',
    },
  ],
}

export default function HomePage() {
  return (
    <div className="isolate flex min-h-dvh flex-col">
      <script {...jsonLdProps(jsonLd)} />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <AppsMcp />
        <Architecture />

        <SdkShowcase />

        <Cta />
      </main>
      <SiteFooter />
    </div>
  );
}
