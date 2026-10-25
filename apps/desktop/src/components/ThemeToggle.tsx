/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from 'react';
import { themeToggleStyles } from './theme-toggle-styles';

interface ThemeToggleProps {
  value?: 'light' | 'dark';
  size?: number;
  onChange?: (theme: 'light' | 'dark') => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ value = 'light', size = 3, onChange }) => {
  const [isDark, setIsDark] = useState(value === 'dark');
  const [isClicked, setIsClicked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    stars: null,
  });

  const fontSize = `${(size / 3).toFixed(2)}px`;

  // Coordinates from script.js
  const starHoverPos = [
    { top: '10em', left: '36em' },
    { top: '40em', left: '87em' },
    { top: '26em', left: '16em' },
    { top: '38em', left: '63em' },
    { top: '20.5em', left: '72em' },
    { top: '51.5em', left: '35em' },
  ];

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
    { right: '110em', bottom: '-55em' },
  ];

  const clearInlineStyles = useCallback(() => {
    const dom = domRef.current;
    if (!dom.mainButton) return;

    dom.mainButton.style.transform = '';
    dom.daytimeBackground?.forEach((el) => (el.style.transform = ''));
    dom.cloudSons?.forEach((el) => {
      el.style.right = '';
      el.style.bottom = '';
    });
    dom.stars?.forEach((el) => {
      el.style.top = '';
      el.style.left = '';
    });
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const newValue = !prev;
      const theme = newValue ? 'dark' : 'light';
      onChange?.(theme);
      return newValue;
    });
    setIsClicked(true);

    // Clear inline styles so CSS classes take over
    clearInlineStyles();

    setTimeout(() => setIsClicked(false), 500);
  }, [onChange, clearInlineStyles]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isClicked || !domRef.current.mainButton) return;

      const dom = domRef.current;

      if (isDark) {
        // Dark Mode Hover
        dom.mainButton!.style.transform = 'translateX(100em)';
        if (dom.daytimeBackground) {
          dom.daytimeBackground[0].style.transform = 'translateX(100em)';
          dom.daytimeBackground[1].style.transform = 'translateX(73em)';
          dom.daytimeBackground[2].style.transform = 'translateX(46em)';
        }

        dom.stars?.forEach((star, i) => {
          if (starHoverPos[i]) {
            star.style.top = starHoverPos[i].top;
            star.style.left = starHoverPos[i].left;
          }
        });
      } else {
        // Light Mode Hover
        dom.mainButton!.style.transform = 'translateX(10em)';
        if (dom.daytimeBackground) {
          dom.daytimeBackground[0].style.transform = 'translateX(10em)';
          dom.daytimeBackground[1].style.transform = 'translateX(7em)';
          dom.daytimeBackground[2].style.transform = 'translateX(4em)';
        }

        dom.cloudSons?.forEach((cloud, i) => {
          if (cloudHoverPos[i]) {
            cloud.style.right = cloudHoverPos[i].right;
            cloud.style.bottom = cloudHoverPos[i].bottom;
          }
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isClicked, isDark]
  );

  const handleMouseOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isClicked) return;
      clearInlineStyles();
    },
    [isClicked, clearInlineStyles]
  );

  // Sync with external value
  useEffect(() => {
    setIsDark(value === 'dark');
    clearInlineStyles();
  }, [value, clearInlineStyles]);

  // Initialize DOM elements. Cloud drift is CSS-driven and needs no JS timer.
  useEffect(() => {
    if (containerRef.current) {
      domRef.current = {
        mainButton: containerRef.current.querySelector('.main-button'),
        daytimeBackground: containerRef.current.querySelectorAll('.daytime-background'),
        cloudSons: containerRef.current.querySelectorAll('.cloud-son'),
        stars: containerRef.current.querySelectorAll('.star'),
      };
    }
  }, []);

  // System theme listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches !== isDark) {
        toggle();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [isDark, toggle]);

  return (
    <div ref={containerRef} className="theme-toggle-container" style={{ fontSize }}>
      <style>{themeToggleStyles}</style>
      <div className={`components ${isDark ? 'dark' : ''}`} onClick={toggle}>
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
  );
};
export default ThemeToggle;
