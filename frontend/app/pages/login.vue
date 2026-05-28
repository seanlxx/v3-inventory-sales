<script setup lang="ts">
definePageMeta({
  layout: false
})
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

        <!-- 关闭提示 -->
        <main class="login-card__body">
          <section class="login-closed" aria-labelledby="login-closed-title">
            <div class="login-closed__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2.25" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                <path d="M12 15v2" />
              </svg>
            </div>
            <h2 id="login-closed-title" class="login-closed__title">后台登录已暂时关闭</h2>
            <p class="login-closed__text">
              当前线上后台已暂停账号密码登录。请等待管理员重新开放后再访问。
            </p>
            <div class="login-closed__status">
              <span class="status-dot status-dot--paused"></span>
              <span class="status-text status-text--paused">账号密码入口已停用</span>
            </div>
          </section>
        </main>

        <!-- 页脚声明 -->
        <footer class="login-card__footer">
          <p>© 2026 V3 Vending Operations. Encrypted Console.</p>
          <div class="footer-status">
            <span class="status-dot status-dot--paused"></span>
            <span class="status-text status-text--paused">ACCESS PAUSED</span>
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

.login-closed {
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  text-align: center;
  border: 1px solid rgba(239, 68, 68, 0.14);
  border-radius: var(--radius-3);
  background: rgba(254, 242, 242, 0.65);
  padding: 28px 24px;
}

.login-closed__icon {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #b91c1c;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(185, 28, 28, 0.08);
}

.login-closed__title {
  margin: 0;
  color: #991b1b;
  font-size: 19px;
  font-weight: 800;
}

.login-closed__text {
  margin: 0;
  color: #6b1f1f;
  font-size: 14px;
  line-height: 1.7;
}

.login-closed__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-1);
  border: 1px solid rgba(185, 28, 28, 0.12);
  border-radius: 999px;
  background: #ffffff;
  padding: 5px 10px;
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

.status-dot--paused {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
}

.status-text {
  font-size: 10.5px;
  font-weight: 700;
  color: #10b981;
}

.status-text--paused {
  color: #b91c1c;
}

@keyframes pulse-dot {
  0% { opacity: 0.5; }
  100% { opacity: 1; }
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
  
  .login-closed {
    padding: 24px 18px;
  }
}
</style>
