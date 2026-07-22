import { useState } from 'react';
import { TextMorph } from '@dev-jelly/tinytipy-react';
import { correctionPairs } from '../../data/pairs';

export function App() {
  const [index, setIndex] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [inlineCursor, setInlineCursor] = useState(false);

  const pair = correctionPairs[index];
  if (!pair) return null;

  const go = (delta: number) => {
    setIndex((i) => (i + delta + correctionPairs.length) % correctionPairs.length);
    setNonce((n) => n + 1);
  };
  const replay = () => setNonce((n) => n + 1);

  return (
    <main className="pg">
      <header className="pg-header">
        <h1>tinytipy</h1>
        <p className="pg-sub">
          변경 전 → 변경 후. 바뀐 부분만 지웠다가 다시 타이핑합니다.
        </p>
      </header>

      <section className="pg-card">
        <div className="pg-meta">
          <span className="pg-tag">#{pair.id}</span>
          <span className="pg-cat">{pair.category}</span>
          <span className="pg-layout">
            cursor: {inlineCursor ? 'inline (legacy)' : 'overlay (default)'}
          </span>
        </div>

        {/* key change => remount + autoPlay => replay */}
        <div className="pg-morph">
          <TextMorph
            key={`${index}-${nonce}`}
            from={pair.from}
            to={pair.to}
            autoPlay
            prefersReducedMotion={reduced}
            cursorLayout={inlineCursor ? 'inline' : undefined}
            className="pg-morph-text"
          />
        </div>

        <div className="pg-controls">
          <button onClick={() => go(-1)} type="button">← 이전</button>
          <button onClick={replay} type="button">↻ 다시 재생</button>
          <button onClick={() => go(1)} type="button">다음 →</button>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => setReduced(e.target.checked)}
            />
            reduced motion
          </label>
          <label className="pg-toggle">
            <input
              type="checkbox"
              checked={inlineCursor}
              onChange={(e) => setInlineCursor(e.target.checked)}
            />
            inline cursor (legacy)
          </label>
        </div>
      </section>

      <section className="pg-raw">
        <div>
          <h3>변경 전 (from)</h3>
          <p className={pair.from ? undefined : 'pg-empty'}>
            {pair.from || '빈 문자열'}
          </p>
        </div>
        <div>
          <h3>변경 후 (to)</h3>
          <p>{pair.to}</p>
        </div>
      </section>

      <footer className="pg-foot">
        <span>
          {index + 1} / {correctionPairs.length} · tinytipy by @dev-jelly
        </span>
        <nav className="pg-links" aria-label="프로젝트 링크">
          <a
            className="pg-project-link pg-project-link--npm"
            href="https://www.npmjs.com/package/@dev-jelly/tinytipy"
            target="_blank"
            rel="noreferrer"
            aria-label="tinytipy npm 패키지 새 탭에서 열기"
          >
            <svg
              className="pg-brand-logo pg-brand-logo--npm"
              viewBox="0 0 780 250"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M240 250h100v-50h100V0H240v250zm100-200h50v100h-50V50zM480 0v200h100V50h50v150h50V50h50v150h50V0H480zM0 200h100V50h50v150h50V0H0v200z" />
            </svg>
            <span>npm</span>
          </a>
          <a
            className="pg-project-link"
            href="https://github.com/dev-jelly/tinytipy"
            target="_blank"
            rel="noreferrer"
            aria-label="tinytipy GitHub 저장소 새 탭에서 열기"
          >
            <svg
              className="pg-brand-logo pg-brand-logo--github"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
            </svg>
            <span>GitHub</span>
          </a>
        </nav>
      </footer>
    </main>
  );
}
