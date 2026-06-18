import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('pages/LoginPage.vue'),
  },
  {
    path: '/register',
    component: () => import('pages/RegisterPage.vue'),
  },
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/app',
    component: () => import('layouts/MainLayout.vue'),
    redirect: '/app/dashboard',
    children: [
      { path: 'dashboard', component: () => import('pages/DashboardPage.vue') },
      { path: 'transactions', component: () => import('pages/TransactionsPage.vue') },
      { path: 'upload', component: () => import('pages/UploadPage.vue') },
      { path: 'budgets', component: () => import('pages/BudgetsPage.vue') },
      { path: 'goals', component: () => import('pages/SavingsGoalsPage.vue') },
      { path: 'subscriptions', component: () => import('pages/SubscriptionsPage.vue') },
      { path: 'investments', component: () => import('pages/InvestmentsPage.vue') },
      { path: 'reports', component: () => import('pages/ReportsPage.vue') },
      { path: 'ai-chat', component: () => import('pages/AiChatPage.vue') },
      { path: 'categories', component: () => import('pages/CategoriesPage.vue') },
      { path: 'settings', component: () => import('pages/SettingsPage.vue') },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
