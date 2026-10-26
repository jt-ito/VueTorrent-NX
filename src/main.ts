import { createApp } from 'vue'
import 'unfonts.css' // eslint-disable-line import/no-unresolved -- Import generated at build-time by unplugin-fonts Vite plugin
import './styles/styles.scss'
import Vue3Toastify, { toast } from 'vue3-toastify'
import App from './App.vue'
import i18n from './plugins/i18n'
import pinia from './plugins/pinia'
import router from './plugins/router'
import toastifyOptions from './plugins/toastify'
import vuetify from './plugins/vuetify'
import { useAppLogStore } from './stores/appLogs'
import { installAppLogCapture } from './utils/appLogCapture'

const app = createApp(App)

app.config.performance = true

// A toast's timer only starts once its entrance animation ends, and hidden tabs don't run animations,
// so toasts shown right before switching tabs would otherwise sit there until the user comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) toast.clearAll(undefined, false)
})

app.use(router).use(vuetify).use(i18n).use(Vue3Toastify, toastifyOptions).use(pinia).mount('#app')

installAppLogCapture(pinia)
useAppLogStore(pinia).add('info', 'app', `VueTorrent ${import.meta.env.VITE_PACKAGE_VERSION ?? 'dev'} started`, navigator.userAgent)
