<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

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
    toastStore.show('登录成功，欢迎回来', 'success')

    const redirectPath = typeof route.query.redirect === 'string'
      ? route.query.redirect
      : '/dashboard'

    await navigateTo(redirectPath, { replace: true })
  } catch (error: any) {
    localError.value = error.message || '登录失败，请检查账号和密码'
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <header class="login-brand">
        <div class="login-brand__mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span class="login-brand__slot--active"></span>
        </div>
        <div>
          <p class="login-brand__name">V3 售货机管理</p>
          <p class="login-brand__note">经营数据控制台</p>
        </div>
      </header>

      <div class="login-intro">
        <h1 id="login-title">登录</h1>
        <p>使用管理账号继续进入系统。</p>
      </div>

      <form class="login-form" @submit.prevent="submitLogin">
        <div class="form-group">
          <label class="form-label" for="username">账号</label>
          <div class="input-wrapper">
            <span class="input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              id="username"
              v-model="loginDraft.username"
              class="form-input"
              type="text"
              placeholder="请输入账号"
              autocomplete="username"
              :disabled="loginPending"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">密码</label>
          <div class="input-wrapper">
            <span class="input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="10" width="16" height="11" rx="3" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <input
              id="password"
              v-model="loginDraft.password"
              class="form-input form-input--password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              autocomplete="current-password"
              :disabled="loginPending"
              required
            />
            <button
              type="button"
              class="password-toggle"
              :disabled="loginPending"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3l18 18" />
                <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9.5 4.6 10 8a10.7 10.7 0 0 1-2.2 4.3" />
                <path d="M6.2 6.2A10.7 10.7 0 0 0 2 12c.5 3.4 4.5 8 10 8a10.7 10.7 0 0 0 3.8-.7" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>

        <Transition name="feedback">
          <div v-if="localError || authErrorMessage" class="login-feedback" role="alert">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            <span>{{ localError || authErrorMessage }}</span>
          </div>
        </Transition>

        <button
          class="login-button"
          type="submit"
          :disabled="loginPending"
          :aria-busy="loginPending"
        >
          <span v-if="loginPending" class="login-spinner" aria-hidden="true"></span>
          {{ loginPending ? '正在登录' : '登录' }}
        </button>
      </form>

      <p class="login-note">仅限已授权的管理人员使用</p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 18% 12%, rgba(40, 84, 197, 0.1), transparent 30%),
    #f3f6fa;
  color: #182033;
}

.login-page::before {
  position: fixed;
  inset: 0;
  content: '';
  pointer-events: none;
  background-image:
    linear-gradient(rgba(24, 32, 51, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(24, 32, 51, 0.025) 1px, transparent 1px);
  background-size: 32px 32px;
  -webkit-mask-image: linear-gradient(to bottom, #000, transparent 82%);
  mask-image: linear-gradient(to bottom, #000, transparent 82%);
}

.login-card {
  position: relative;
  width: min(100%, 388px);
  padding: 30px;
  border: 1px solid #dfe5ed;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 50px rgba(30, 44, 71, 0.1);
}

.login-card::after {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 38px;
  height: 3px;
  border-radius: 99px;
  background: #2854c5;
  content: '';
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-brand__mark {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(2, 8px);
  grid-template-rows: repeat(2, 8px);
  gap: 4px;
  place-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid #d9e0ea;
  border-radius: 13px;
  background: #f7f9fc;
}

.login-brand__mark span {
  border-radius: 3px;
  background: #b8c2d1;
}

.login-brand__mark .login-brand__slot--active {
  background: #2854c5;
  box-shadow: 0 0 0 3px rgba(40, 84, 197, 0.12);
}

.login-brand__name,
.login-brand__note,
.login-intro h1,
.login-intro p,
.login-note {
  margin: 0;
}

.login-brand__name {
  font-size: 14px;
  font-weight: 750;
  letter-spacing: 0.01em;
}

.login-brand__note {
  margin-top: 3px;
  color: #748095;
  font-size: 12px;
}

.login-intro {
  margin-top: 26px;
}

.login-intro h1 {
  font-size: 26px;
  font-weight: 760;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.login-intro p {
  margin-top: 7px;
  color: #69758a;
  font-size: 13px;
  line-height: 1.6;
}

.login-form {
  display: grid;
  gap: 16px;
  margin-top: 22px;
}

.form-group {
  display: grid;
  gap: 7px;
}

.form-label {
  color: #3d485c;
  font-size: 13px;
  font-weight: 650;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  z-index: 1;
  display: inline-flex;
  color: #8a95a7;
  pointer-events: none;
}

.form-input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px 0 43px;
  border: 1px solid #d8dfe9;
  border-radius: 12px;
  outline: none;
  background: #fbfcfe;
  color: #182033;
  font: inherit;
  font-size: 14px;
  transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

.form-input--password {
  padding-right: 48px;
}

.form-input::placeholder {
  color: #a0a9b8;
}

.form-input:focus {
  border-color: #2854c5;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(40, 84, 197, 0.12);
}

.input-wrapper:focus-within .input-icon {
  color: #2854c5;
}

.form-input:disabled {
  cursor: wait;
  opacity: 0.7;
}

.password-toggle {
  position: absolute;
  right: 2px;
  display: inline-grid;
  width: 44px;
  height: 44px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #7c8799;
  cursor: pointer;
}

.password-toggle:hover:not(:disabled) {
  color: #2854c5;
}

.password-toggle:focus-visible,
.login-button:focus-visible {
  outline: 3px solid rgba(40, 84, 197, 0.24);
  outline-offset: 2px;
}

.login-feedback {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #f0c8c3;
  border-radius: 10px;
  background: #fff5f3;
  color: #a3382c;
  font-size: 12.5px;
  line-height: 1.45;
}

.login-feedback svg {
  flex: 0 0 auto;
  margin-top: 1px;
}

.login-button {
  display: inline-flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 2px;
  padding: 0 18px;
  border: 0;
  border-radius: 12px;
  background: #2854c5;
  box-shadow: 0 8px 18px rgba(40, 84, 197, 0.2);
  color: #ffffff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #2149b2;
  box-shadow: 0 10px 22px rgba(40, 84, 197, 0.24);
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

.login-button:disabled {
  background: #6f87c4;
  box-shadow: none;
  cursor: wait;
}

.login-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.42);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

.login-note {
  margin-top: 20px;
  color: #8a95a7;
  font-size: 11px;
  text-align: center;
}

.feedback-enter-active,
.feedback-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.feedback-enter-from,
.feedback-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 520px) {
  .login-page {
    padding-right: 14px;
    padding-left: 14px;
  }

  .login-card {
    padding: 24px 20px;
    border-radius: 18px;
  }

  .login-intro {
    margin-top: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .form-input,
  .login-button,
  .login-feedback {
    transition: none;
  }

  .login-spinner {
    animation-duration: 1.4s;
  }
}
</style>
