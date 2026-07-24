import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../pages/Login.vue'),
    },
    {
      path: '/',
      component: () => import('../components/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'Dashboard',
          component: () => import('../pages/Dashboard.vue'),
        },
        {
          path: 'apps',
          name: 'AppManage',
          component: () => import('../pages/AppManage.vue'),
        },
        {
          path: 'stats',
          name: 'Stats',
          component: () => import('../pages/Stats.vue'),
        },
      ],
    },
  ],
})

// 路由守卫：未登录跳登录页
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.name !== 'Login' && !token) {
    next('/login')
  } else if (to.name === 'Login' && token) {
    next('/')
  } else {
    next()
  }
})

export default router
