export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2026-06-03',

  modules: ['@nuxt/ui'],

  nitro: {
    experimental: { websocket: true },
  },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Exo+2:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap',
        },
      ],
    },
  },

  icon: {
    serverBundle: 'local',
    clientBundle: { scan: false },
  },
})
