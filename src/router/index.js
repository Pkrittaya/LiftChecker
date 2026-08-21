import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/',
    redirect: '/lifts',
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { public: true },
  },
  {
    path: '/lifts',
    name: 'lifts',
    component: () => import('../views/LiftListView.vue'),
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('../views/UsersView.vue'),
    meta: { admin: true },
  },
  {
    path: '/checklist-admin',
    name: 'checklist-admin',
    component: () => import('../views/ChecklistAdminView.vue'),
    meta: { admin: true },
  },
  {
    path: '/scan',
    name: 'scan',
    component: () => import('../views/ScanView.vue'),
  },
  {
    path: '/lifts/:id',
    name: 'lift-detail',
    component: () => import('../views/LiftDetailView.vue'),
    props: true,
  },
  {
    path: '/lifts/:id/report',
    name: 'lift-report',
    component: () => import('../views/LiftReportView.vue'),
    props: true,
  },
  {
    path: '/lifts/:id/report/:reportId/edit',
    name: 'lift-report-edit',
    component: () => import('../views/LiftReportView.vue'),
    props: true,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && auth.user?.role !== 'admin' && auth.user?.role !== 'super_admin') {
    return { name: 'lifts' }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'lifts' }
  }
  return true
})

export default router
