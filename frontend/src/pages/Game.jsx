import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import YasLogo from '../components/YasLogo';
import Plectre from '../components/Plectre';

const TOTAL_QUESTIONS = 15;
const TIME_LIMIT = 30;

export default function Game() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [feedback, setFeedback] = useState(null);
  const [swipeDir, setSwipeDir] = useState(null);
  const [swipeDelta, setSwipeDelta] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const timerRef = useRef(null);
  const touchStartX = useRef(null);
  const isDragging = useRef(false);
  const answering = useRef(false);
  const handleAnswerRef = useRef(null);

  useEffect(() => { initGame(); return () => clearInterval(timerRef.current); }, []);

  useEffect(() => {
    if (!loading && questions.length > 0 && !feedback) {
      setQuestionStartTime(Date.now());
      setTimeLeft(TIME_LIMIT);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current); handleAnswerRef.current?.(null); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [current, loading, feedback]);

  // Réponse au clavier sur desktop : ← = faux, → = vrai
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleAnswerRef.current?.(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handleAnswerRef.current?.(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Précharge l'image de la question suivante pour éviter le flash
  useEffect(() => {
    setImgBroken(false);
    const next = questions[current + 1];
    if (next?.image_url) { const img = new Image(); img.src = next.image_url; }
  }, [current, questions]);

  async function initGame() {
    const player = JSON.parse(localStorage.getItem('sw_player') || 'null');
    if (!player) return navigate('/');
    try {
      const [qRes, sRes] = await Promise.all([
        api.get(`/questions/random?count=${TOTAL_QUESTIONS}`),
        api.post('/sessions/start', { player_id: player.id }),
      ]);
      setQuestions(qRes.data.questions);
      setSessionId(sRes.data.session.id);
      setLoading(false);
    } catch (err) {
      if (err.response?.data?.paused) {
        setPaused(true);
        setLoading(false);
      } else {
        navigate('/');
      }
    }
  }

  const handleAnswer = useCallback(async (userAnswer) => {
    if (feedback || answering.current || !sessionId || questions.length === 0) return;
    answering.current = true;
    clearInterval(timerRef.current);

    // Réaction immédiate : la carte s'envole dans le sens de la réponse
    // (pas de vol en cas de timeout — la carte reste en place)
    if (userAnswer === true) { setSwipeDir('right'); setSwipeDelta(560); }
    else if (userAnswer === false) { setSwipeDir('left'); setSwipeDelta(-560); }

    const q = questions[current];
    const responseTimeMs = questionStartTime ? Date.now() - questionStartTime : TIME_LIMIT * 1000;
    let isCorrect = false;
    try {
      const { data } = await api.post(`/sessions/${sessionId}/answer`, {
        question_id: q.id, answer: userAnswer, response_time_ms: responseTimeMs,
      });
      isCorrect = data.is_correct;
    } catch { /* continue */ }
    setFeedback(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) {
      const bonus = Math.max(0, 5 - Math.floor(responseTimeMs / 1000));
      setScore(sc => sc + 10 + bonus);
    }
    setTimeout(() => {
      setFeedback(null); setSwipeDelta(0); setSwipeDir(null);
      answering.current = false;
      if (current + 1 >= questions.length) endGame();
      else setCurrent(c => c + 1);
    }, 850);
  }, [feedback, sessionId, questions, current, questionStartTime]);

  // Toujours pointer vers la dernière version (timer + clavier)
  useEffect(() => { handleAnswerRef.current = handleAnswer; }, [handleAnswer]);

  async function endGame() {
    const total = questions.length || TOTAL_QUESTIONS;
    try {
      const { data } = await api.post(`/sessions/${sessionId}/end`);
      navigate('/game-over', { state: { session: data.session, total } });
    } catch {
      navigate('/game-over', { state: { session: { score, correct_count: 0 }, total } });
    }
  }

  function dragStart(x) { touchStartX.current = x; isDragging.current = true; }
  function dragMove(x) {
    if (!isDragging.current) return;
    const d = x - touchStartX.current;
    setSwipeDelta(d);
    setSwipeDir(d > 30 ? 'right' : d < -30 ? 'left' : null);
  }
  function dragEnd() {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (answering.current) return;
    if (swipeDelta > 80) handleAnswer(true);
    else if (swipeDelta < -80) handleAnswer(false);
    else { setSwipeDelta(0); setSwipeDir(null); }
  }

  if (loading) return (
    <div style={s.loading}>
      <YasLogo size={70} />
      <p style={{ color: '#00377D', marginTop: 16, fontWeight: 800 }}>Chargement...</p>
    </div>
  );

  if (paused) return (
    <div style={s.loading}>
      <YasLogo size={70} />
      <p style={{ fontSize: 48, marginTop: 16 }}>⏸</p>
      <p style={{ color: '#00377D', marginTop: 8, fontWeight: 800, fontSize: 18, textAlign: 'center', padding: '0 24px' }}>
        Le jeu est en pause pour le moment.
      </p>
      <p style={{ color: '#64748b', marginTop: 4, fontSize: 14, textAlign: 'center', padding: '0 24px' }}>
        Reviens un peu plus tard !
      </p>
      <button
        style={{
          marginTop: 24, padding: '14px 28px', borderRadius: 14, border: 'none',
          background: '#FFD100', color: '#00377D', fontFamily: "'Figtree', sans-serif",
          fontWeight: 900, fontSize: 16, cursor: 'pointer',
        }}
        onClick={() => navigate('/')}
      >
        Retour à l'accueil
      </button>
    </div>
  );

  const q = questions[current];
  const total = questions.length || TOTAL_QUESTIONS;
  const timerPct = (timeLeft / TIME_LIMIT) * 100;
  const timerColor = timeLeft > 20 ? '#22C55E' : timeLeft > 10 ? '#FFD109' : '#EF4444';
  const rot = swipeDelta * 0.05;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.scorePlectre}>
          <Plectre color="blue" size={104} rotate={-12} style={{ position: 'absolute', inset: 0 }} />
          <div style={s.scoreInner}>
            <span style={s.scoreLabel}>SCORE</span>
            <span style={s.scoreValue}>{score}</span>
          </div>
        </div>
      </div>

      {/* Timer */}
      <div style={s.timerWrap}>
        <div style={s.timerHead}>
          <span style={s.progressText}>Question {current + 1}/{total}</span>
          <span style={{ ...s.timeText, color: timerColor }}>⏱ {timeLeft}s</span>
        </div>
        <div style={s.timerTrack}>
          <div style={{ ...s.timerFill, width: `${timerPct}%`, background: timerColor }} />
        </div>
      </div>

      {/* Swipe labels */}
      <div style={s.swipeLabels}>
        <div style={{ ...s.swLabel, ...s.swFaux, opacity: swipeDir === 'left' ? 1 : 0.25 }}>✕ FAUX</div>
        <div style={{ ...s.swLabel, ...s.swVrai, opacity: swipeDir === 'right' ? 1 : 0.25 }}>VRAI ✓</div>
      </div>

      {/* Card */}
      <div style={s.cardZone}>
        <div style={s.cardWrap}>
          <div
            style={{
              ...s.card,
              transform: `translateX(${swipeDelta}px) rotate(${rot}deg)`,
              transition: isDragging.current ? 'none' : 'transform 0.35s ease',
              cursor: isDragging.current ? 'grabbing' : 'grab',
              opacity: Math.abs(swipeDelta) > 400 ? 0 : 1,
              borderColor: swipeDir === 'right' ? '#22C55E' : swipeDir === 'left' ? '#EF4444' : '#FFD109',
            }}
            onTouchStart={e => dragStart(e.touches[0].clientX)}
            onTouchMove={e => dragMove(e.touches[0].clientX)}
            onTouchEnd={dragEnd}
            onMouseDown={e => dragStart(e.clientX)}
            onMouseMove={e => dragMove(e.clientX)}
            onMouseUp={dragEnd}
            onMouseLeave={dragEnd}
          >
            {/* Photo background (or fallback si absente ou cassée) */}
            {q.image_url && !imgBroken ? (
              <img src={q.image_url} alt="" style={s.cardImg} draggable={false} onError={() => setImgBroken(true)} />
            ) : (
              <div style={s.cardFallback}>
                <Plectre color="yellow" size={120} rotate={-20} style={{ opacity: 0.25 }} />
                <span style={s.fallbackBall}>{q.category === 'coupe_du_monde' ? '⚽' : q.category === 'comores' ? '🏝️' : '🎯'}</span>
              </div>
            )}

            {/* Swipe stamps */}
            <div style={{ ...s.stamp, ...s.stampVrai, opacity: swipeDir === 'right' ? 1 : 0 }}>VRAI ✓</div>
            <div style={{ ...s.stamp, ...s.stampFaux, opacity: swipeDir === 'left' ? 1 : 0 }}>✕ FAUX</div>

            {/* Bottom gradient + question */}
            <div style={s.cardGradient} />
            <p style={s.question}>{q.text_fr}</p>
            <p style={s.hint}>← Glisse pour répondre →</p>
          </div>

          {/* Feedback : reste centré pendant que la carte s'envole */}
          {feedback && (
            <div style={{ ...s.overlay, background: feedback === 'correct' ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)' }}>
              <span style={s.overlayEmoji}>{feedback === 'correct' ? '✅' : '❌'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div style={s.buttons}>
        <button style={{ ...s.btnFaux, opacity: feedback ? 0.5 : 1 }} onClick={() => handleAnswer(false)} disabled={!!feedback}>✕</button>
        <button style={{ ...s.btnVrai, opacity: feedback ? 0.5 : 1 }} onClick={() => handleAnswer(true)} disabled={!!feedback}>✓</button>
      </div>
    </div>
  );
}

const s = {
  loading: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'white' },
  container: {
    minHeight: '100vh', background: '#F0F4FF',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '16px 18px 28px', userSelect: 'none',
  },
  header: { width: '100%', maxWidth: 480, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 16 },
  scorePlectre: { position: 'relative', width: 104, height: 130 },
  scoreInner: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  scoreLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 800, letterSpacing: 1 },
  scoreValue: { color: '#FFD109', fontWeight: 900, fontSize: 26, lineHeight: 1 },
  timerWrap: { width: '100%', maxWidth: 480, marginBottom: 16 },
  timerHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  progressText: { fontSize: 13, color: '#64748b', fontWeight: 800 },
  timeText: { fontSize: 13, fontWeight: 800 },
  timerTrack: { height: 10, background: '#dbe3f4', borderRadius: 6, overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 6, transition: 'width 1s linear, background 0.4s' },
  swipeLabels: { width: '100%', maxWidth: 480, display: 'flex', justifyContent: 'space-between', marginBottom: 12 },
  swLabel: { fontWeight: 900, fontSize: 15, letterSpacing: 1, padding: '4px 14px', borderRadius: 30, transition: 'opacity 0.15s' },
  swFaux: { color: '#EF4444', background: 'rgba(239,68,68,0.12)' },
  swVrai: { color: '#22C55E', background: 'rgba(34,197,94,0.12)' },
  cardZone: { flex: 1, width: '100%', maxWidth: 460, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  cardWrap: { position: 'relative', width: '100%', height: 'clamp(320px, 50vh, 440px)' },
  card: {
    position: 'absolute', inset: 0, background: '#00377D', borderRadius: 28,
    border: '4px solid #FFD109',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
    padding: '0', overflow: 'hidden',
    boxShadow: '0 16px 44px rgba(0,55,125,0.28)',
    touchAction: 'none', willChange: 'transform', WebkitUserSelect: 'none',
  },
  cardImg: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', userSelect: 'none', pointerEvents: 'none',
  },
  cardFallback: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(160deg, #004aa3 0%, #00377D 60%, #002452 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  fallbackBall: { position: 'absolute', fontSize: 84 },
  cardGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%',
    background: 'linear-gradient(to top, rgba(0,20,46,0.92) 18%, rgba(0,20,46,0.55) 55%, rgba(0,20,46,0) 100%)',
    pointerEvents: 'none',
  },
  overlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 28, zIndex: 10, animation: 'sw-pop 0.25s ease' },
  overlayEmoji: { fontSize: 90 },
  stamp: {
    position: 'absolute', top: 22, padding: '8px 18px', borderRadius: 12,
    fontWeight: 900, fontSize: 22, letterSpacing: 1, color: 'white',
    border: '3px solid white', transition: 'opacity 0.12s', zIndex: 8,
  },
  stampVrai: { right: 20, background: 'rgba(34,197,94,0.85)', transform: 'rotate(12deg)' },
  stampFaux: { left: 20, background: 'rgba(239,68,68,0.85)', transform: 'rotate(-12deg)' },
  question: {
    position: 'relative', zIndex: 5,
    fontWeight: 800, fontSize: 22, color: 'white', textAlign: 'center',
    lineHeight: 1.35, padding: '0 24px', textShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  hint: { position: 'relative', zIndex: 5, marginTop: 14, marginBottom: 24, fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 700 },
  buttons: { width: '100%', maxWidth: 320, display: 'flex', justifyContent: 'space-between', gap: 24 },
  btnFaux: {
    flex: 1, height: 70, borderRadius: 24, border: 'none',
    background: 'white', color: '#EF4444', fontSize: 30, fontWeight: 900, cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(239,68,68,0.2)', border: '2px solid #fee2e2',
  },
  btnVrai: {
    flex: 1, height: 70, borderRadius: 24, border: 'none',
    background: 'white', color: '#22C55E', fontSize: 30, fontWeight: 900, cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(34,197,94,0.2)', border: '2px solid #dcfce7',
  },
};
