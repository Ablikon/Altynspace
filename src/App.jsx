import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { motion, AnimatePresence } from 'framer-motion'
import { OrbitControls } from '@react-three/drei'
import './App.css'
import SpaceScene from './components/SpaceScene'
import PortalJourney from './components/PortalJourney'
import StarflightEpilogue from './components/StarflightEpilogue'
import EarthDive from './components/EarthDive'
import SupernovaBirth from './components/SupernovaBirth'

const captions = [
  'Момент, когда я понял, что ты - моя судьба 💫',
  'Твоя улыбка освещает даже самые темные дни ✨',
  'Это был лучший день! Помнишь? 🌟',
  'С тобой каждое приключение становится волшебным 🎭',
  'Твои глаза — целая вселенная 🌌',
  'Наш маленький космос счастья 🌙',
  'Ты делаешь обычные моменты особенными 💝',
  'Вместе мы можем всё! 🚀',
  'Эта фотка — доказательство нашей химии 💕',
  'Когда ты рядом, время останавливается ⏰',
  'Твой смех — моя любимая мелодия 🎵',
  'Мы как две звезды на одной орбите 🌠',
  'С тобой я чувствую себя как дома 🏡',
  'Наша история только начинается 📖',
  'Ты — мое самое яркое созвездие 🌟',
  'Каждый день с тобой — это подарок 🎁',
  'Мы создаем свою галактику любви 💖',
  'Твоя поддержка значит для меня всё 🤗',
  'Вот почему я влюбился в тебя снова 💘',
  'Ты — мой любимый человек во вселенной 🌍',
  'Наши мечты сбываются вместе ✨',
  'Ты вдохновляешь меня быть лучше 🌈',
  'С тобой я вижу мир по-другому 👁️',
  'Наша любовь сильнее гравитации 💪',
  'Спасибо, что ты есть в моей жизни 🙏',
  'Мы — команда мечты! 🎯',
  'Я люблю тебя больше, чем звезд на небе 🌃',
  'Каждый закат с тобой — шедевр 🌅',
  'Ты — мой лучший сюрприз 🎉',
  'Наш смех — лучшая музыка 🎶',
  'Ты делаешь мой мир ярче 🌈',
  'Это фото хранит столько тепла 🔥',
  'С тобой даже тишина красива 🤍',
  'Мы — два пазла, идеально подходящих друг другу 🧩',
  'Ты — моя звезда на небосводе ⭐',
  'Каждое мгновение с тобой бесценно 💎',
  'Наша химия нарушает законы физики ⚡',
  'Ты — моя лучшая глава 📕',
  'С тобой хочется мечтать 🌠',
  'Мы создаём свой маленький рай 🏝️',
  'Ты — мой компас в этой жизни 🧭',
  'Наши приключения — лучшие истории 📸',
  'Ты заряжаешь меня энергией 🔋',
  'С тобой мир становится теплее ☀️',
  'Эта фотка — наше маленькое чудо ✨',
  'Ты — моя любимая мелодия 🎹',
  'Мы — бесконечная история 📚',
  'С тобой каждый момент — праздник 🎊',
  'Ты — мой покой и мой огонь 🕊️',
  'Наша любовь — вечный двигатель 💗',
  'Ты делаешь жизнь вкуснее 🍰',
  'Мы — две планеты на одной орбите 🪐',
  'Ты — мой самый дорогой человек 💞',
  'С тобой я не боюсь ничего 🛡️',
  'Наша связь сильнее стали 🔗',
  'Ты — моё всё 💜',
  'Каждый день рядом с тобой — счастье 😊',
  'Ты — лучшее, что со мной случилось 🌻',
  'Наш путь — самый красивый 🛤️',
  'С тобой хочется жить на полную 🎢',
  'Ты — мой якорь и мои крылья ⚓',
  'Мы — самая крутая пара 🏆',
  'Ты — источник моего вдохновения 💡',
  'С тобой всё обретает смысл 🗝️',
  'Наши объятия лечат всё 🤗',
  'Ты — мой дом 🏠',
  'Мы сияем вместе ярче 💫',
  'Ты — моя бесконечность ♾️',
  'Наша любовь освещает галактику 🌌',
  'Ты — причина моей улыбки 😍',
  'Мы — вечные звёзды 🌟',
  'С тобой я нашёл себя 🧡',
  'Ты — моё солнце и луна 🌞',
  'Наша история — лучшая во вселенной 📖',
  'Ты — мой ангел-хранитель 👼',
  'Мы — неразлучные навсегда 💑',
  'Ты — мой космос, Алтынай 🌌',
  'Рядом с тобой даже звёзды завидуют ✨',
  'Ты — моя единственная вселенная 💖',
  'Я люблю тебя до луны и обратно 🌙',
]

const photos = Array.from({ length: 81 }, (_, i) => {
  const n = i + 1
  return {
    thumb: `/gallery/thumbs/photo${n}.webp`,
    src: `/gallery/full/photo${n}.webp`,
    caption: captions[i] || `Момент #${n} ✨`,
  }
})

function App() {
  const [step, setStep] = useState(0)
  const [currentMessage, setCurrentMessage] = useState(0)
  const [showStart, setShowStart] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const photoGroups = {
    1: photos.slice(0, 14),
    2: photos.slice(14, 28),
    3: photos.slice(28, 42),
    4: photos.slice(42, 56),
    5: photos.slice(56, 70),
    6: photos.slice(70, 81),
  }

  const messages = [
    {
      title: 'Старт путешествия 🚀',
      text: 'Сейчас мы отправимся в космическое путешествие по нашим самым дорогим воспоминаниям.',
    },
    {
      title: 'Глава 1. Начало 💫',
      text: 'Первая планета — это наши шаги навстречу друг другу. Каждое фото здесь хранит магию начала.',
    },
    {
      title: 'Глава 2. Наш космос 🌌',
      text: 'Планета справа светится нашим счастьем. Здесь живут моменты, когда мы были просто вместе.',
    },
    {
      title: 'Глава 3. Мечты ✨',
      text: 'Эта планета — наш тёплый дом, где рождаются мечты и растут истории.',
    },
    {
      title: 'Глава 4. Сияние 🪐',
      text: 'Золотистая планета хранит моменты, которые заставляют нас сиять ярче всех звёзд.',
    },
    {
      title: 'Глава 5. Приключения 🔥',
      text: 'Красная планета — наши смелые шаги вперёд, наши приключения и открытия.',
    },
    {
      title: 'Ты — моя вселенная 💖',
      text: 'В бесконечности космоса есть только одна константа — моя любовь к тебе, Алтынай.',
    },
  ]

  const TOTAL_STEPS = 6

  const letterLines = [
    'Моей Алтынай,',
    '',
    'Я пролетел через целую вселенную, чтобы сказать тебе то, что мое сердце шепчет каждый день.',
    '',
    'Ты знаешь, я не всегда нахожу правильные слова. Но рядом с тобой мне и не нужно - ты чувствуешь все без слов.',
    '',
    'Спасибо, что ты смеешься так, что весь мир замирает.',
    'Спасибо, что обнимаешь так, будто ничего больше не существует.',
    'Спасибо, что веришь в меня, даже когда я сам сомневаюсь.',
    '',
    'С тобой обычный вечер становится лучшим воспоминанием.',
    'С тобой тишина звучит красивее любой музыки.',
    'С тобой я наконец понял, что значит «быть дома».',
    '',
    'Ты - мое утро и мой закат.',
    'Ты - моя самая красивая случайность и моя самая важная неизбежность.',
    '',
    'Эта вселенная, которую я создал - лишь маленькое отражение того, что я чувствую к тебе. Настоящая вселенная моей любви не поместится ни в какой экран.',
    '',
    'Я люблю тебя, Алтынай. Вчера, сегодня, завтра - и через миллиард световых лет.',
    '',
    'Навсегда твой ❤️',
  ]

  const handlePhotoClick = (globalIndex) => setSelectedPhoto(globalIndex)
  const closePhoto = () => setSelectedPhoto(null)
  const nextPhoto = (e) => {
    e.stopPropagation()
    setSelectedPhoto((prev) => (prev + 1) % photos.length)
  }
  const prevPhoto = (e) => {
    e.stopPropagation()
    setSelectedPhoto((prev) => (prev - 1 + photos.length) % photos.length)
  }

  const [portalActive, setPortalActive] = useState(false)
  const [letterVisible, setLetterVisible] = useState(false)
  const [epilogueActive, setEpilogueActive] = useState(false)
  const [earthDiveActive, setEarthDiveActive] = useState(false)
  const [supernovaActive, setSupernovaActive] = useState(false)
  const letterContainerRef = useRef(null)

  useEffect(() => {
    if (!letterVisible) return
    const totalDelay = (1.0 + letterLines.length * 0.35 + 1.0) * 1000
    const scrollTimer = setTimeout(() => {
      if (letterContainerRef.current) {
        letterContainerRef.current.scrollTo({
          top: letterContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      }
    }, totalDelay)
    return () => clearTimeout(scrollTimer)
  }, [letterVisible])

  const handleNextStep = () => {
    if (step === TOTAL_STEPS) {
      setPortalActive(true)
    } else {
      const next = step + 1
      setStep(next)
      setCurrentMessage(Math.min(next, messages.length - 1))
    }
  }

  const handlePrevStep = () => {
    setStep(Math.max(step - 1, 0))
    setCurrentMessage(Math.max(currentMessage - 1, 0))
  }

  const handlePortalComplete = () => {
    setLetterVisible(true)
  }

  const handleBackFromLetter = () => {
    setPortalActive(false)
    setLetterVisible(false)
  }

  const handleStartEpilogue = () => {
    setEpilogueActive(true)
    setLetterVisible(false)
  }

  const handleEpilogueComplete = () => {
    setEpilogueActive(false)
    setEarthDiveActive(true)
  }

  const handleRestart = () => {
    setPortalActive(false)
    setLetterVisible(false)
    setEpilogueActive(false)
    setEarthDiveActive(false)
    setSupernovaActive(false)
    setStep(0)
    setCurrentMessage(0)
  }

  const handleStartSupernova = () => {
    setEarthDiveActive(false)
    setSupernovaActive(true)
  }

  if (supernovaActive) {
    return <SupernovaBirth onRestart={handleRestart} />
  }

  if (earthDiveActive) {
    return <EarthDive onRestart={handleRestart} onNext={handleStartSupernova} />
  }

  if (epilogueActive) {
    return <StarflightEpilogue onComplete={handleEpilogueComplete} />
  }

  if (portalActive) {
    return (
      <>
        <PortalJourney onComplete={handlePortalComplete} onBack={handleBackFromLetter} />

        <AnimatePresence>
          {letterVisible && (
            <motion.div
              className="letter-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
            >
              <motion.div
                ref={letterContainerRef}
                className="letter-container"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                <h2 className="letter-title">Моей Алтынай</h2>
                <div className="letter-body">
                  {letterLines.map((line, i) => (
                    <motion.p
                      key={i}
                      className={line === '' ? 'letter-line letter-spacer' : 'letter-line'}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.0 + i * 0.35, duration: 0.6 }}
                    >
                      {line || '\u00A0'}
                    </motion.p>
                  ))}
                </div>
                <motion.div
                  className="letter-footer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.0 + letterLines.length * 0.35 + 0.5, duration: 0.8 }}
                >
                  <button className="planet-button" onClick={handleBackFromLetter}>
                    Назад
                  </button>
                  <button className="planet-button" onClick={handleStartEpilogue}>
                    Дальше
                  </button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  return (
    <>
      <div className="canvas-container">
        <Canvas
          camera={{ position: [0, 8, 42], fov: isMobile ? 60 : 50 }}
          dpr={isMobile ? [1, 1.5] : [1, 2]}
          gl={{
            antialias: !isMobile,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
          }}
        >
          <Suspense fallback={null}>
            <SpaceScene
              step={step}
              photoGroups={photoGroups}
              onPhotoClick={handlePhotoClick}
              isMobile={isMobile}
            />
          </Suspense>
          <OrbitControls
            enableZoom={true}
            minDistance={isMobile ? 10 : 8}
            maxDistance={isMobile ? 50 : 40}
            enablePan={false}
            enableRotate={true}
            autoRotate={false}
            rotateSpeed={isMobile ? 0.5 : 1}
            enableDamping={true}
            dampingFactor={0.05}
          />
        </Canvas>
      </div>

      <div className="ui-overlay">
        <div style={{ marginTop: '0.5rem' }}>
          <AnimatePresence mode="wait">
            {showStart ? (
              <motion.div
                key="start"
                initial={{ opacity: 0, scale: 0.8, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -20 }}
                className="message-card"
              >
                <h2>Для самой лучшей Алтынай 💝</h2>
                <p>Я сделал для тебя космическое путешествие по нашей истории.</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.8rem', opacity: 0.8, lineHeight: 1.5 }}>
                  Лети вперед по главам, приближай планеты и рассмотри наши моменты в космосе.
                </p>
                <button
                  className="planet-button"
                  onClick={() => {
                    const a = document.getElementById('bg-audio')
                    if (a) { a.muted = false; a.play().catch(() => { }) }
                    setShowStart(false)
                    setStep(0)
                    setCurrentMessage(0)
                  }}
                >
                  Взлететь 🚀
                </button>
              </motion.div>
            ) : (
              <motion.div
                key={currentMessage}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="message-card"
              >
                <h2>{messages[currentMessage].title}</h2>
                <p>{messages[currentMessage].text}</p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                  <button
                    className="planet-button"
                    style={{ opacity: step === 0 ? 0.4 : 1 }}
                    onClick={handlePrevStep}
                    disabled={step === 0}
                  >
                    Назад
                  </button>
                  <button className="planet-button" onClick={handleNextStep}>
                    {step === TOTAL_STEPS ? 'Дальше ✨' : 'Дальше ✨'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!showStart && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="instructions"
          >
            Свайпай экран / верти телефон, приближай планеты и кликай на фото 🌟
          </motion.p>
        )}
      </div>

      <AnimatePresence>
        {selectedPhoto !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="photo-modal-overlay"
            onClick={closePhoto}
          >
            <motion.div
              initial={{ scale: 0.3, rotateY: 90 }}
              animate={{ scale: 1, rotateY: 0 }}
              exit={{ scale: 0.3, rotateY: -90 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              onClick={(e) => e.stopPropagation()}
              className="photo-modal-container"
            >
              <div className="photo-modal-content">
                <img
                  src={photos[selectedPhoto].src}
                  alt={photos[selectedPhoto].caption}
                  className="photo-modal-img"
                  loading="lazy"
                />
                <p className="photo-modal-caption">
                  {photos[selectedPhoto].caption}
                </p>
              </div>

              <button onClick={closePhoto} className="photo-modal-close">✕</button>
              <button onClick={prevPhoto} className="photo-modal-prev">‹</button>
              <button onClick={nextPhoto} className="photo-modal-next">›</button>

              <div className="photo-modal-counter">
                {selectedPhoto + 1} / {photos.length}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default App
