import { useState } from 'react';
import { TextMorph } from '@dev-jelly/tinytipy-react';
import { correctionPairs } from '../../data/pairs';

export function App() {
  const [index, setIndex] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [reduced, setReduced] = useState(false);

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
          타사(오인식) → 콜라보(보정). 바뀐 부분만 지웠다가 다시 타이핑합니다.
        </p>
      </header>

      <section className="pg-card">
        <div className="pg-meta">
          <span className="pg-tag">#{pair.id}</span>
          <span className="pg-cat">{pair.category}</span>
        </div>

        {/* key change => remount + autoPlay => replay */}
        <div className="pg-morph">
          <TextMorph
            key={`${index}-${nonce}`}
            from={pair.from}
            to={pair.to}
            autoPlay
            prefersReducedMotion={reduced}
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
        </div>
      </section>

      <section className="pg-raw">
        <div>
          <h3>타사 (from)</h3>
          <p className={pair.from ? undefined : 'pg-empty'}>
            {pair.from || '빈 문자열'}
          </p>
        </div>
        <div>
          <h3>콜라보 (to)</h3>
          <p>{pair.to}</p>
        </div>
      </section>

      <footer className="pg-foot">
        {index + 1} / {correctionPairs.length} ·&nbsp;
        tinytipy by @dev-jelly
      </footer>
    </main>
  );
}
