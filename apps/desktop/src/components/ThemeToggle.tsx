import { useState, useEffect, useRef, useCallback } from 'react'

interface ThemeToggleProps {
  value?: 'light' | 'dark'
  size?: number
  onChange?: (theme: 'light' | 'dark') => void
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({
  value = 'light',
  size = 3,
  onChange
}) => {
  const [isDark, setIsDark] = useState(value === 'dark')
  const [isClicked, setIsClicked] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<number | null>(null)
  
  // Ref to hold DOM elements for direct manipulation
  const domRef = useRef<{
    mainButton: HTMLElement | null;
    daytimeBackground: NodeListOf<HTMLElement> | null;
    cloudSons: NodeListOf<HTMLElement> | null;
    stars: NodeListOf<HTMLElement> | null;
  }>({
    mainButton: null,
    daytimeBackground: null,
    cloudSons: null,
    stars: null
  })

  const fontSize = `${(size / 3).toFixed(2)}px`

  // Coordinates from script.js
  const starHoverPos = [
    { top: '10em', left: '36em' },
    { top: '40em', left: '87em' },
    { top: '26em', left: '16em' },
    { top: '38em', left: '63em' },
    { top: '20.5em', left: '72em' },
    { top: '51.5em', left: '35em' }
  ]

  const cloudHoverPos = [
    { right: '-24em', bottom: '10em' },
    { right: '-12em', bottom: '-27em' },
    { right: '17em', bottom: '-43em' },
    { right: '46em', bottom: '-39em' },
    { right: '70em', bottom: '-65em' },
    { right: '109em', bottom: '-54em' },
    { right: '-23em', bottom: '10em' },
    { right: '-11em', bottom: '-26em' },
    { right: '18em', bottom: '-42em' },
    { right: '47em', bottom: '-38em' },
    { right: '74em', bottom: '-64em' },
    { right: '110em', bottom: '-55em' }
  ]

  const getRandomDirection = useCallback(() => {
    const directions = ['2em', '-2em']
    return directions[Math.floor(Math.random() * directions.length)]
  }, [])

  const moveElementRandomly = useCallback((element: HTMLElement) => {
    const randomDirectionX = getRandomDirection()
    const randomDirectionY = getRandomDirection()
    element.style.transform = `translate(${randomDirectionX}, ${randomDirectionY})`
  }, [getRandomDirection])

  const clearInlineStyles = useCallback(() => {
    const dom = domRef.current
    if (!dom.mainButton) return

    dom.mainButton.style.transform = ''
    dom.daytimeBackground?.forEach(el => el.style.transform = '')
    dom.cloudSons?.forEach(el => {
      el.style.right = ''
      el.style.bottom = ''
    })
    dom.stars?.forEach(el => {
      el.style.top = ''
      el.style.left = ''
    })
  }, [])

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const newValue = !prev
      const theme = newValue ? 'dark' : 'light'
      onChange?.(theme)
      return newValue
    })
    setIsClicked(true)
    
    // Clear inline styles so CSS classes take over
    clearInlineStyles()

    setTimeout(() => setIsClicked(false), 500)
  }, [onChange, clearInlineStyles])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isClicked || !domRef.current.mainButton) return

    const dom = domRef.current

    if (isDark) {
      // Dark Mode Hover
      dom.mainButton!.style.transform = "translateX(100em)"
      if (dom.daytimeBackground) {
        dom.daytimeBackground[0].style.transform = "translateX(100em)"
        dom.daytimeBackground[1].style.transform = "translateX(73em)"
        dom.daytimeBackground[2].style.transform = "translateX(46em)"
      }

      dom.stars?.forEach((star, i) => {
        if (starHoverPos[i]) {
          star.style.top = starHoverPos[i].top
          star.style.left = starHoverPos[i].left
        }
      })
    } else {
      // Light Mode Hover
      dom.mainButton!.style.transform = "translateX(10em)"
      if (dom.daytimeBackground) {
        dom.daytimeBackground[0].style.transform = "translateX(10em)"
        dom.daytimeBackground[1].style.transform = "translateX(7em)"
        dom.daytimeBackground[2].style.transform = "translateX(4em)"
      }

      dom.cloudSons?.forEach((cloud, i) => {
        if (cloudHoverPos[i]) {
          cloud.style.right = cloudHoverPos[i].right
          cloud.style.bottom = cloudHoverPos[i].bottom
        }
      })
    }
  }, [isClicked, isDark])

  const handleMouseOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isClicked) return
    clearInlineStyles()
  }, [isClicked, clearInlineStyles])

  // Sync with external value
  useEffect(() => {
    setIsDark(value === 'dark')
    clearInlineStyles()
  }, [value, clearInlineStyles])

  // Initialize DOM elements and Cloud floating animation
  useEffect(() => {
    if (containerRef.current) {
      domRef.current = {
        mainButton: containerRef.current.querySelector('.main-button'),
        daytimeBackground: containerRef.current.querySelectorAll('.daytime-background'),
        cloudSons: containerRef.current.querySelectorAll('.cloud-son'),
        stars: containerRef.current.querySelectorAll('.star')
      }

      const cloudSons = domRef.current.cloudSons
      if (cloudSons) {
        intervalRef.current = window.setInterval(() => {
          cloudSons.forEach(moveElementRandomly)
        }, 1000)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [moveElementRandomly])

  // System theme listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches !== isDark) {
        toggle()
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [isDark, toggle])

  return (
    <div ref={containerRef} className="theme-toggle-container" style={{ fontSize }}>
      <style>{styles}</style>
      <div
        className={`components ${isDark ? 'dark' : ''}`}
        onClick={toggle}
      >
        {/* Sun/Moon Button */}
        <div 
          className={`main-button ${isDark ? 'dark' : ''}`}
          onMouseMove={handleMouseMove}
          onMouseOut={handleMouseOut}
        >
          <div className={`moon ${isDark ? 'visible' : ''}`} />
          <div className={`moon ${isDark ? 'visible' : ''}`} />
          <div className={`moon ${isDark ? 'visible' : ''}`} />
        </div>

        {/* Daytime Background */}
        <div className={`daytime-background ${isDark ? 'dark' : ''}`} />
        <div className={`daytime-background ${isDark ? 'dark' : ''}`} />
        <div className={`daytime-background ${isDark ? 'dark' : ''}`} />

        {/* Clouds */}
        <div className={`cloud ${isDark ? 'dark' : ''}`}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="cloud-son" />
          ))}
        </div>

        <div className={`cloud-light ${isDark ? 'dark' : ''}`}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="cloud-son" />
          ))}
        </div>

        {/* Stars */}
        <div className={`stars ${isDark ? 'visible' : ''}`}>
          {['big', 'big', 'medium', 'medium', 'small', 'small'].map((sizeClass, i) => (
            <div key={i} className={`star ${sizeClass}`}>
              {[...Array(4)].map((_, j) => (
                <div key={j} className="star-son" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = `
  .theme-toggle-container * {
    margin: 0;
    padding: 0;
    transition: 0.7s;
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  }

  .theme-toggle-container {
    position: relative;
    width: 180em;
    height: 70em;
    display: inline-block;
    vertical-align: bottom;
    transform: translate3d(0, 0, 0);
  }

  .theme-toggle-container .components {
    position: relative;
    width: 180em;
    height: 70em;
    background-color: rgba(70, 133, 192, 1);
    border-radius: 100em;
    box-shadow: inset 0 0 5em 3em rgba(0, 0, 0, 0.5);
    overflow: hidden;
    transition: 0.7s;
    transition-timing-function: cubic-bezier(0, 0.5, 1, 1);
    cursor: pointer;
  }

  .theme-toggle-container .components.dark {
    background-color: rgba(25, 30, 50, 1);
  }

  .theme-toggle-container .main-button {
    margin: 7.5em 0 0 7.5em;
    width: 55em;
    height: 55em;
    background-color: rgba(255, 195, 35, 1);
    border-radius: 50%;
    box-shadow: 3em 3em 5em rgba(0, 0, 0, 0.5),
      inset -3em -5em 3em -3em rgba(0, 0, 0, 0.5),
      inset 4em 5em 2em -2em rgba(255, 230, 80, 1);
    transition: 1s;
    transition-timing-function: cubic-bezier(0.56, 1.35, 0.52, 1);
    transform: translateX(0);
  }

  .theme-toggle-container .main-button.dark {
    transform: translateX(110em);
    background-color: rgba(195, 200, 210, 1);
    box-shadow: 3em 3em 5em rgba(0, 0, 0, 0.5),
      inset -3em -5em 3em -3em rgba(0, 0, 0, 0.5),
      inset 4em 5em 2em -2em rgba(255, 255, 210, 1);
  }

  .theme-toggle-container .moon {
    position: absolute;
    background-color: rgba(150, 160, 180, 1);
    box-shadow: inset 0em 0em 1em 1em rgba(0, 0, 0, 0.3);
    border-radius: 50%;
    transition: 0.5s;
    opacity: 0;
  }

  .theme-toggle-container .moon.visible {
    opacity: 1;
  }

  .theme-toggle-container .moon:nth-child(1) {
    top: 7.5em;
    left: 25em;
    width: 12.5em;
    height: 12.5em;
  }

  .theme-toggle-container .moon:nth-child(2) {
    top: 20em;
    left: 7.5em;
    width: 20em;
    height: 20em;
  }

  .theme-toggle-container .moon:nth-child(3) {
    top: 32.5em;
    left: 32.5em;
    width: 12.5em;
    height: 12.5em;
  }

  .theme-toggle-container .daytime-background {
    position: absolute;
    border-radius: 50%;
    transition: 1s;
    transition-timing-function: cubic-bezier(0.56, 1.35, 0.52, 1);
    transform: translateX(0);
  }

  .theme-toggle-container .daytime-background:nth-child(2) {
    top: -20em;
    left: -20em;
    width: 110em;
    height: 110em;
    background-color: rgba(255, 255, 255, 0.2);
    z-index: -2;
  }

  .theme-toggle-container .daytime-background:nth-child(3) {
    top: -32.5em;
    left: -17.5em;
    width: 135em;
    height: 135em;
    background-color: rgba(255, 255, 255, 0.1);
    z-index: -3;
  }

  .theme-toggle-container .daytime-background:nth-child(4) {
    top: -45em;
    left: -15em;
    width: 160em;
    height: 160em;
    background-color: rgba(255, 255, 255, 0.05);
    z-index: -4;
  }

  .theme-toggle-container .daytime-background.dark:nth-child(2) {
    transform: translateX(110em);
  }

  .theme-toggle-container .daytime-background.dark:nth-child(3) {
    transform: translateX(80em);
  }

  .theme-toggle-container .daytime-background.dark:nth-child(4) {
    transform: translateX(50em);
  }

  .theme-toggle-container .cloud,
  .theme-toggle-container .cloud-light {
    transform: translateY(10em);
    transition: 1s;
    transition-timing-function: cubic-bezier(0.56, 1.35, 0.52, 1);
  }

  .theme-toggle-container .cloud.dark,
  .theme-toggle-container .cloud-light.dark {
    transform: translateY(80em);
  }

  .theme-toggle-container .cloud-son {
    position: absolute;
    background-color: #fff;
    border-radius: 50%;
    z-index: -1;
    transition: transform 6s, right 1s, bottom 1s;
  }

  .theme-toggle-container .cloud-son:nth-child(6n + 1) {
    right: -20em;
    bottom: 10em;
    width: 50em;
    height: 50em;
  }

  .theme-toggle-container .cloud-son:nth-child(6n + 2) {
    right: -10em;
    bottom: -25em;
    width: 60em;
    height: 60em;
  }

  .theme-toggle-container .cloud-son:nth-child(6n + 3) {
    right: 20em;
    bottom: -40em;
    width: 60em;
    height: 60em;
  }

  .theme-toggle-container .cloud-son:nth-child(6n + 4) {
    right: 50em;
    bottom: -35em;
    width: 60em;
    height: 60em;
  }

  .theme-toggle-container .cloud-son:nth-child(6n + 5) {
    right: 75em;
    bottom: -60em;
    width: 75em;
    height: 75em;
  }

  .theme-toggle-container .cloud-son:nth-child(6n + 6) {
    right: 110em;
    bottom: -50em;
    width: 60em;
    height: 60em;
  }

  .theme-toggle-container .cloud {
    z-index: -2;
  }

  .theme-toggle-container .cloud-light {
    position: absolute;
    right: 0em;
    bottom: 25em;
    opacity: 0.5;
    z-index: -3;
  }

  .theme-toggle-container .stars {
    transform: translateY(-125em);
    opacity: 0;
    z-index: -2;
    transition: 1s;
    transition-timing-function: cubic-bezier(0.56, 1.35, 0.52, 1);
  }

  .theme-toggle-container .stars.visible {
    transform: translateY(-62.5em);
    opacity: 1;
  }

  .theme-toggle-container .big {
    --size: 7.5em;
  }

  .theme-toggle-container .medium {
    --size: 5em;
  }

  .theme-toggle-container .small {
    --size: 3em;
  }

  .theme-toggle-container .star {
    position: absolute;
    width: calc(2 * var(--size));
    height: calc(2 * var(--size));
    transform: scale(1);
    transition-timing-function: cubic-bezier(0.56, 1.35, 0.52, 1);
    transition: 1s;
    animation-iteration-count: infinite;
    animation-direction: alternate;
    animation-timing-function: linear;
  }

  .theme-toggle-container .star:nth-child(1) {
    top: 11em;
    left: 39em;
    animation-name: theme-toggle-star;
    animation-duration: 3.5s;
  }

  .theme-toggle-container .star:nth-child(2) {
    top: 39em;
    left: 91em;
    animation-name: theme-toggle-star;
    animation-duration: 4.1s;
  }

  .theme-toggle-container .star:nth-child(3) {
    top: 26em;
    left: 19em;
    animation-name: theme-toggle-star;
    animation-duration: 4.9s;
  }

  .theme-toggle-container .star:nth-child(4) {
    top: 37em;
    left: 66em;
    animation-name: theme-toggle-star;
    animation-duration: 5.3s;
  }

  .theme-toggle-container .star:nth-child(5) {
    top: 21em;
    left: 75em;
    animation-name: theme-toggle-star;
    animation-duration: 3s;
  }

  .theme-toggle-container .star:nth-child(6) {
    top: 51em;
    left: 38em;
    animation-name: theme-toggle-star;
    animation-duration: 2.2s;
  }

  @keyframes theme-toggle-star {
    0%,
    20% {
      transform: scale(0);
    }
    20%,
    100% {
      transform: scale(1);
    }
  }

  .theme-toggle-container .star-son {
    float: left;
    width: var(--size);
    height: var(--size);
  }

  .theme-toggle-container .star-son:nth-child(1) {
    --pos: left 0;
  }

  .theme-toggle-container .star-son:nth-child(2) {
    --pos: right 0;
  }

  .theme-toggle-container .star-son:nth-child(3) {
    --pos: 0 bottom;
  }

  .theme-toggle-container .star-son:nth-child(4) {
    --pos: right bottom;
  }

  .theme-toggle-container .star-son {
    background-image: radial-gradient(
      circle var(--size) at var(--pos),
      transparent var(--size),
      #fff
    );
  }
`

export default ThemeToggle