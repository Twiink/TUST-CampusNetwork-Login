# ThemeToggle 白天黑夜切换按钮组件

一个精美的白天/黑夜主题切换按钮组件，提供 Vue 3 和 React 两个版本。

## 功能特性

- 平滑的白天/黑夜切换动画
- 太阳/月亮形态转换
- 云朵飘动效果
- 星星闪烁动画
- 支持自定义尺寸
- 支持双向绑定
- 自动监听系统主题变化

---

## Vue 3 版本

### 安装

将 `ThemeToggle.vue` 复制到你的项目组件目录中。

### 基础用法

```vue
<template>
  <div class="app">
    <ThemeToggle v-model="theme" />
    <p>当前主题: {{ theme }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ThemeToggle from '@/components/ThemeToggle.vue'

const theme = ref('light')
</script>
```

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `modelValue` | `'light'` \| `'dark'` | `'light'` | 当前主题值，支持 `v-model` |
| `size` | `number` | `3` | 按钮尺寸，数值越大按钮越大 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `'light'` \| `'dark'` | 主题变化时触发，用于 `v-model` |
| `change` | `'light'` \| `'dark'` | 主题变化时触发 |

### 完整示例

```vue
<template>
  <div class="demo" :class="{ dark: theme === 'dark' }">
    <h1>主题切换演示</h1>

    <!-- 基础用法 -->
    <ThemeToggle v-model="theme" />

    <!-- 自定义尺寸 -->
    <ThemeToggle v-model="theme" :size="2" />
    <ThemeToggle v-model="theme" :size="4" />

    <!-- 监听变化事件 -->
    <ThemeToggle
      v-model="theme"
      @change="handleThemeChange"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import ThemeToggle from '@/components/ThemeToggle.vue'

const theme = ref('light')

const handleThemeChange = (newTheme) => {
  console.log('主题已切换为:', newTheme)

  // 可以在这里更新全局主题
  document.documentElement.setAttribute('data-theme', newTheme)
}

// 监听主题变化，更新页面背景色
watch(theme, (newTheme) => {
  document.body.style.backgroundColor =
    newTheme === 'dark' ? '#1a1a2e' : '#ffffff'
})
</script>

<style>
.demo {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  transition: background-color 0.5s;
}

.demo.dark {
  background-color: #1a1a2e;
  color: #ffffff;
}
</style>
```

---

## React 版本

### 安装

将 `ThemeToggle.tsx` 复制到你的项目组件目录中。

### 依赖

确保项目已安装 React 18+：

```bash
npm install react react-dom
```

如使用 TypeScript，确保已配置 TypeScript 支持。

### 基础用法

```tsx
import { useState } from 'react'
import ThemeToggle from './components/ThemeToggle'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  return (
    <div className="app">
      <ThemeToggle value={theme} onChange={setTheme} />
      <p>当前主题: {theme}</p>
    </div>
  )
}

export default App
```

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `value` | `'light'` \| `'dark'` | `'light'` | 当前主题值 |
| `size` | `number` | `3` | 按钮尺寸，数值越大按钮越大 |
| `onChange` | `(theme: 'light' \| 'dark') => void` | - | 主题变化回调函数 |

### 完整示例

```tsx
import { useState, useEffect } from 'react'
import ThemeToggle from './components/ThemeToggle'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // 主题变化时更新页面样式
  useEffect(() => {
    document.body.style.backgroundColor =
      theme === 'dark' ? '#1a1a2e' : '#ffffff'
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    console.log('主题已切换为:', newTheme)
    setTheme(newTheme)
  }

  return (
    <div className={`demo ${theme === 'dark' ? 'dark' : ''}`}>
      <h1>主题切换演示</h1>

      {/* 基础用法 */}
      <ThemeToggle value={theme} onChange={handleThemeChange} />

      {/* 自定义尺寸 */}
      <ThemeToggle value={theme} onChange={setTheme} size={2} />
      <ThemeToggle value={theme} onChange={setTheme} size={4} />
    </div>
  )
}

export default App
```

### JavaScript 版本

如果不使用 TypeScript，将文件重命名为 `ThemeToggle.jsx` 并移除类型注解：

```jsx
import { useState, useEffect, useRef, useCallback } from 'react'

const ThemeToggle = ({ value = 'light', size = 3, onChange }) => {
  const [isDark, setIsDark] = useState(value === 'dark')
  // ... 其余代码保持不变
}

export default ThemeToggle
```

---

## 尺寸参考

| size 值 | 按钮宽度 | 适用场景 |
|---------|----------|----------|
| 1 | ~60px | 小型导航栏 |
| 2 | ~120px | 中型按钮 |
| 3 | ~180px | 标准尺寸（默认） |
| 4 | ~240px | 大型展示 |
| 5 | ~300px | 超大展示 |

---

## 系统主题同步

组件会自动监听系统主题变化（`prefers-color-scheme`），当系统切换深色/浅色模式时，组件会自动同步切换。

如需禁用此功能，可以修改组件源码，移除相关的 `matchMedia` 监听代码。

---

## 样式定制

### 修改颜色

在组件的样式部分，可以修改以下关键颜色：

```css
/* 白天背景色 */
.components {
  background-color: rgba(70, 133, 192, 1);
}

/* 黑夜背景色 */
.components.dark {
  background-color: rgba(25, 30, 50, 1);
}

/* 太阳颜色 */
.main-button {
  background-color: rgba(255, 195, 35, 1);
}

/* 月亮颜色 */
.main-button.dark {
  background-color: rgba(195, 200, 210, 1);
}
```

---

## 注意事项

1. 组件使用 `em` 单位实现缩放，通过 `size` 属性控制根字体大小
2. 组件内部使用相对定位，请确保父容器有足够空间
3. 动画使用 CSS transition，确保浏览器支持 CSS3
4. React 版本的样式通过内联 `<style>` 标签注入，避免样式冲突

---

## 浏览器支持

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

---

## License

MIT
