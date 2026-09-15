import { storeToRefs } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from '@/pages'
import { useAppStore } from '@/stores'

const router = createRouter({
  history: createWebHashHistory(process.env.BASE_URL),
  routes,
})

router.beforeResolve(to => {
  const { isAuthenticated } = storeToRefs(useAppStore())
  const isPublic = to.meta.public === true

  if (!isPublic && !isAuthenticated.value) {
    return { name: 'login', query: { redirect: location.hash.slice(1) } }
  }
})

router.onError(error => {
  if (/Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(error.message)) {
    location.reload()
  }
})

export default router
