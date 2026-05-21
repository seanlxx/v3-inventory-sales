<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

definePageMeta({
  layout: false
})

const { login, status: authStatus, errorMessage: authErrorMessage } = useAuth()
const route = useRoute()
const toastStore = useToastStore()

const loginDraft = reactive({
  username: 'admin',
  password: ''
})

const showPassword = ref(false)
const localError = ref('')
const isSuccess = ref(false)

const loginPending = computed(() => authStatus.value === 'pending')

async function submitLogin() {
  localError.value = ''
  if (!loginDraft.username.trim() || !loginDraft.password) {
    localError.value = '请输入账号和密码'
    return
  }

  try {
    await login({
      username: loginDraft.username.trim(),
      password: loginDraft.password
    })
    isSuccess.value = true
    toastStore.show('登录成功，欢迎回来', 'success')
    
    // 获取重定向地址
    const redirectPath = (route.query.redirect as string) || '/dashboard'
    
    // 延迟一小会儿，让登录成功动画播放完毕
    setTimeout(() => {
      navigateTo(redirectPath, { replace: true })
    }, 800)
  } catch (error: any) {
    isSuccess.value = false
    localError.value = error.message || '登录失败，请检查账号和密码'
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 动态浅色水晶背景 -->
    <div class="login-bg" aria-hidden="true">
      <div class="login-bg__glow login-bg__glow--1"></div>
      <div class="login-bg__glow login-bg__glow--2"></div>
      <div class="login-bg__glow login-bg__glow--3"></div>
      <div class="login-bg__grid"></div>
    </div>

    <!-- 登录主体 -->
    <div class="login-container">
      <div class="login-card">
        <!-- 装饰线 -->
        <div class="login-card__top-bar"></div>

        <!-- 头部品牌标志 -->
        <header class="login-card__header">
          <div class="login-logo" aria-hidden="true">
            <!-- 高科技 3D 棱镜立体 SVG 图标 -->
            <svg class="login-logo__svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#2563eb" />
                  <stop offset="50%" stop-color="#7c3aed" />
                  <stop offset="100%" stop-color="#0f766e" />
                </linearGradient>
                <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <!-- 外圈立体结构 -->
              <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" stroke="url(#logoGrad)" stroke-width="2.5" fill="none" opacity="0.3" />
              <polygon points="50,12 82,31 82,69 50,88 18,69 18,31" stroke="url(#logoGrad)" stroke-width="1.5" fill="none" opacity="0.6" />
              <!-- 内层闪耀核心 -->
              <polygon points="50,22 74,36 74,64 50,78 26,64 26,36" fill="url(#logoGrad)" filter="url(#logoGlow)" opacity="0.85" />
              <!-- 核心刻线 -->
              <line x1="50" y1="22" x2="50" y2="78" stroke="#ffffff" stroke-width="1" opacity="0.4" />
              <line x1="26" y1="36" x2="74" y2="64" stroke="#ffffff" stroke-width="1" opacity="0.4" />
              <line x1="26" y1="64" x2="74" y2="36" stroke="#ffffff" stroke-width="1" opacity="0.4" />
            </svg>
            <div class="login-logo__pulse"></div>
          </div>
          
          <h1 class="login-card__title">V3 智能售货机控制台</h1>
          <p class="login-card__subtitle">AI-Vending Operations & Inventory System</p>
        </header>

        <!-- 登录表单 -->
        <main class="login-card__body">
          <form @submit.prevent="submitLogin" class="login-form">
            <!-- 账号输入 -->
            <div class="form-group">
              <label class="form-label" for="username">
                <span class="form-label__text">账号</span>
                <span class="form-label__tag">ADMINISTRATOR</span>
              </label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="username"
                  v-model="loginDraft.username"
                  class="form-input"
                  type="text"
                  placeholder="请输入您的管理账号"
                  autocomplete="username"
                  :disabled="loginPending || isSuccess"
                  required
                />
              </div>
            </div>

            <!-- 密码输入 -->
            <div class="form-group">
              <label class="form-label" for="password">
                <span class="form-label__text">密码</span>
                <span class="form-label__tag">SECURE ACCESS</span>
              </label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="password"
                  v-model="loginDraft.password"
                  class="form-input"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="请输入您的登录密码"
                  autocomplete="current-password"
                  :disabled="loginPending || isSuccess"
                  required
                />
                <button
                  type="button"
                  class="password-toggle"
                  @click="showPassword = !showPassword"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                >
                  <svg v-if="showPassword" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 错误信息反馈 -->
            <transition name="fade-slide">
              <div v-if="localError || authErrorMessage" class="login-feedback login-feedback--error" role="alert">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="feedback-icon">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span class="feedback-text">{{ localError || authErrorMessage }}</span>
              </div>
            </transition>

            <!-- 按钮动作 -->
            <div class="form-action">
              <button
                type="submit"
                class="login-btn"
                :class="{
                  'login-btn--pending': loginPending,
                  'login-btn--success': isSuccess
                }"
                :disabled="loginPending || isSuccess"
              >
                <!-- 按钮背景扫描线 -->
                <span class="login-btn__scan"></span>
                
                <!-- 按钮内容 -->
                <span class="login-btn__content">
                  <template v-if="isSuccess">
                    <svg class="success-check" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    验证通过，正在载入...
                  </template>
                  <template v-else-if="loginPending">
                    <span class="btn-spinner" aria-hidden="true"></span>
                    进行密钥握手中...
                  </template>
                  <template v-else>
                    安全登录 SYSTEM ENTRY
                  </template>
                </span>
              </button>
            </div>
          </form>
        </main>

        <!-- 页脚声明 -->
        <footer class="login-card__footer">
          <p>© 2026 V3 Vending Operations. Encrypted Console.</p>
          <div class="footer-status">
            <span class="status-dot"></span>
            <span class="status-text">AI 代理网关已就绪</span>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 登录页面整体排版 */
.login-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #f6f8fb 0%, #eef3f8 100%);
  font-family: var(--font-sans);
  color: #172033;
  padding: var(--space-6) var(--space-4);
}

/* 动态浅色水晶背景 */
.login-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.login-bg__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.85;
  mix-blend-mode: normal;
}

.login-bg__glow--1 {
  top: -10%;
  left: 10%;
  width: 50vw;
  height: 50vw;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0) 70%);
  animation: float-glow-1 25s infinite alternate ease-in-out;
}

.login-bg__glow--2 {
  bottom: -20%;
  right: 5%;
  width: 60vw;
  height: 60vw;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.07) 0%, rgba(168, 85, 247, 0) 70%);
  animation: float-glow-2 30s infinite alternate ease-in-out;
}

.login-bg__glow--3 {
  top: 30%;
  right: 25%;
  width: 35vw;
  height: 35vw;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, rgba(16, 185, 129, 0) 70%);
  animation: float-glow-3 20s infinite alternate ease-in-out;
}

.login-bg__grid {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    linear-gradient(rgba(23, 32, 51, 0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(23, 32, 51, 0.015) 1px, transparent 1px);
  background-size: 40px 40px;
  background-position: center;
  mask-image: radial-gradient(ellipse 60% 60% at 50% 50%, #000 70%, transparent 100%);
}

@keyframes float-glow-1 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(8%, 12%) scale(1.08); }
}

@keyframes float-glow-2 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-8%, -10%) scale(1.05); }
}

@keyframes float-glow-3 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(6%, -8%) scale(1.1); }
}

/* 登录内容容器 */
.login-container {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 440px;
}

/* 玻璃态面板 */
.login-card {
  position: relative;
  width: 100%;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: var(--radius-4);
  box-shadow: 
    0 24px 50px rgba(23, 32, 51, 0.06),
    0 0 40px rgba(37, 99, 235, 0.03),
    inset 0 1px 1px #ffffff;
  padding: 40px;
  overflow: hidden;
  transition: transform var(--transition-bounce), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.login-card:hover {
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow: 
    0 28px 60px rgba(23, 32, 51, 0.08),
    0 0 50px rgba(124, 58, 237, 0.05),
    inset 0 1px 1px #ffffff;
}

.login-card__top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #2563eb, #7c3aed, #0f766e);
}

/* 头部品牌 */
.login-card__header {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  position: relative;
  width: 76px;
  height: 76px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-logo__svg {
  width: 100%;
  height: 100%;
  animation: logo-spin 12s infinite linear;
}

.login-logo__pulse {
  position: absolute;
  top: 5%;
  left: 5%;
  width: 90%;
  height: 90%;
  border-radius: 50%;
  border: 1px solid rgba(124, 58, 237, 0.2);
  filter: blur(1px);
  pointer-events: none;
  animation: pulse-ring 3s infinite ease-out;
}

@keyframes logo-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulse-ring {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.3); opacity: 0; }
}

.login-card__title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.5px;
  background: linear-gradient(135deg, #172033 60%, #4f46e5 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 4px 10px rgba(23, 32, 51, 0.05);
}

.login-card__subtitle {
  margin: var(--space-2) 0 0;
  font-size: 12px;
  color: #6b7280;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* 表单与输入框 */
.login-form {
  display: grid;
  gap: 22px;
}

.form-group {
  display: grid;
  gap: 8px;
}

.form-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.form-label__text {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}

.form-label__tag {
  font-size: 9px;
  font-family: var(--font-mono);
  color: #6b7280;
  letter-spacing: 0.5px;
  opacity: 0.8;
  border: 1px solid rgba(23, 32, 51, 0.08);
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(23, 32, 51, 0.03);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: var(--space-4);
  color: #9ca3af;
  pointer-events: none;
  display: inline-flex;
  transition: color var(--transition-fast);
}

.form-input {
  width: 100%;
  min-height: 48px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(23, 32, 51, 0.12);
  border-radius: var(--radius-2);
  padding: 0 var(--space-4) 0 46px;
  color: #172033;
  font-size: 14px;
  outline: none;
  transition: 
    background-color var(--transition-fast), 
    border-color var(--transition-fast), 
    box-shadow var(--transition-fast);
}

.form-input::placeholder {
  color: #9ca3af;
}

.form-input:focus {
  background: rgba(255, 255, 255, 0.9);
  border-color: #2563eb;
  box-shadow: 
    0 0 0 3px rgba(37, 99, 235, 0.1),
    0 0 12px rgba(37, 99, 235, 0.15);
}

.form-input:focus + .input-icon,
.input-wrapper:focus-within .input-icon {
  color: #2563eb;
}

.password-toggle {
  position: absolute;
  right: var(--space-4);
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  transition: color var(--transition-fast);
}

.password-toggle:hover {
  color: #172033;
}

/* 错误提示 */
.login-feedback {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  background: #fef2f2;
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: var(--radius-2);
  padding: 12px var(--space-4);
}

.feedback-icon {
  color: #ef4444;
  flex-shrink: 0;
  margin-top: 1px;
}

.feedback-text {
  font-size: 12.5px;
  font-weight: 600;
  color: #991b1b;
  line-height: 1.4;
}

/* 登录按钮 */
.form-action {
  margin-top: 8px;
}

.login-btn {
  position: relative;
  width: 100%;
  min-height: 48px;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  border: none;
  border-radius: var(--radius-2);
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.5px;
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.2);
  transition: 
    transform var(--transition-bounce), 
    box-shadow var(--transition-fast), 
    filter var(--transition-fast);
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 
    0 8px 24px rgba(139, 92, 246, 0.3),
    0 0 16px rgba(59, 130, 246, 0.2);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  cursor: not-allowed;
  filter: saturate(0.7) brightness(0.9);
}

/* 能量扫描线效果 */
.login-btn__scan {
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.25) 50%,
    transparent 100%
  );
  transform: skewX(-25deg);
  transition: none;
}

.login-btn:hover:not(:disabled) .login-btn__scan {
  left: 150%;
  transition: left 1.5s cubic-bezier(0.19, 1, 0.22, 1);
}

.login-btn__content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* 各种状态效果 */
.login-btn--pending {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  color: #64748b;
  box-shadow: none;
}

.login-btn--success {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.25);
}

.success-check {
  animation: scale-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes scale-up {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(100, 116, 139, 0.2);
  border-right-color: #64748b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 页脚 */
.login-card__footer {
  margin-top: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  border-top: 1px solid rgba(23, 32, 51, 0.06);
  padding-top: 24px;
}

.login-card__footer p {
  margin: 0;
  font-size: 11px;
  color: #8c93a0;
  font-family: var(--font-mono);
  letter-spacing: 0.2px;
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(23, 32, 51, 0.02);
  border: 1px solid rgba(23, 32, 51, 0.04);
  padding: 3px 8px;
  border-radius: 99px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse-dot 2s infinite alternate;
}

.status-text {
  font-size: 10.5px;
  font-weight: 700;
  color: #10b981;
}

@keyframes pulse-dot {
  0% { opacity: 0.5; }
  100% { opacity: 1; }
}

/* 动效过渡 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 移动端细微样式调整 */
@media (max-width: 760px) {
  .login-page {
    padding: var(--space-4) var(--space-3);
  }
  
  .login-card {
    padding: 32px 24px;
    border-radius: var(--mobile-card-radius);
  }
  
  .login-card__title {
    font-size: 19px;
  }
  
  .form-input {
    min-height: var(--control-height-mobile);
  }
  
  .login-btn {
    min-height: var(--control-height-mobile);
    border-radius: var(--mobile-button-radius);
  }
}
</style>
