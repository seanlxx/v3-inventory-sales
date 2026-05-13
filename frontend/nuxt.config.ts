export default defineNuxtConfig({
  compatibilityDate: '2026-05-05',
  devtools: { enabled: true },
  css: [
    '~/assets/css/tokens.css',
    '~/assets/css/base.css',
    '~/assets/css/layout.css'
  ],
  app: {
    head: {
      title: '无人售货机管理系统',
      htmlAttrs: {
        lang: 'zh-CN'
      },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '无人售货机库存、进货、销售与利润管理系统' }
      ]
    }
  },
  typescript: {
    strict: true,
    typeCheck: true
  }
})
