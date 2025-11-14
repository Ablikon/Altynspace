import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'
import SpaceScene from './components/SpaceScene'
import PhotoGallery from './components/PhotoGallery'

function App() {
  const [currentMessage, setCurrentMessage] = useState(0)
  const [showStart, setShowStart] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  // 27 фотографий с креативными подписями
  const photos = [
    { src: '/gallery/photo1.JPG', caption: 'Момент, когда я понял, что ты - моя судьба 💫' },
    { src: '/gallery/photo2.JPG', caption: 'Твоя улыбка освещает даже самые темные дни ✨' },
    { src: '/gallery/photo3.JPG', caption: 'Это был лучший день! Помнишь? 🌟' },
    { src: '/gallery/photo4.JPG', caption: 'С тобой каждое приключение становится волшебным 🎭' },
    { src: '/gallery/photo5.JPG', caption: 'Твои глаза - целая вселенная 🌌' },
    { src: '/gallery/photo6.JPG', caption: 'Наш маленький космос счастья 🌙' },
    { src: '/gallery/photo7.png', caption: 'Ты делаешь обычные моменты особенными 💝' },
    { src: '/gallery/photo8.png', caption: 'Вместе мы можем всё! 🚀' },
    { src: '/gallery/photo9.png', caption: 'Эта фотка - доказательство нашей химии 💕' },
    { src: '/gallery/photo10.png', caption: 'Когда ты рядом, время останавливается ⏰' },
    { src: '/gallery/photo11.png', caption: 'Твой смех - моя любимая мелодия 🎵' },
    { src: '/gallery/photo12.JPG', caption: 'Мы как две звезды на одной орбите 🌠' },
    { src: '/gallery/photo13.png', caption: 'С тобой я чувствую себя как дома 🏡' },
    { src: '/gallery/photo14.png', caption: 'Наша история только начинается 📖' },
    { src: '/gallery/photo15.png', caption: 'Ты - мое самое яркое созвездие 🌟' },
    { src: '/gallery/photo16.png', caption: 'Каждый день с тобой - это подарок 🎁' },
    { src: '/gallery/photo17.png', caption: 'Мы создаем свою галактику любви 💖' },
    { src: '/gallery/photo18.png', caption: 'Твоя поддержка значит для меня всё 🤗' },
    { src: '/gallery/photo19.png', caption: 'Вот почему я влюбился в тебя снова 💘' },
    { src: '/gallery/photo20.png', caption: 'Ты - мой любимый человек во вселенной 🌍' },
    { src: '/gallery/photo21.png', caption: 'Наши мечты сбываются вместе ✨' },
    { src: '/gallery/photo22.png', caption: 'Ты вдохновляешь меня быть лучше 🌈' },
    { src: '/gallery/photo23.png', caption: 'С тобой я вижу мир по-другому 👁️' },
    { src: '/gallery/photo24.png', caption: 'Наша любовь сильнее гравитации 💪' },
    { src: '/gallery/photo25.JPG', caption: 'Спасибо, что ты есть в моей жизни 🙏' },
    { src: '/gallery/photo26.png', caption: 'Мы - команда мечты! 🎯' },
    { src: '/gallery/photo27.png', caption: 'Я люблю тебя больше, чем звезд на небе 🌃' },
  ]

  const messages = [
    {
      title: "Привет, Алтынай! 💫",
      text: "Добро пожаловать в нашу личную галактику. Каждая планета хранит наши воспоминания.",
      action: null
    },
    {
      title: "Наша вселенная любви 🌌",
      text: "Посмотри вокруг - фотографии вращаются вокруг планет как спутники. Кликни на любую чтобы увидеть поближе!",
      action: null
    },
    {
      title: "27 орбит счастья ✨",
      text: "Каждая фотография на своей орбите вокруг планет. Это символ того, как наши воспоминания вращаются вокруг нашей любви.",
      action: null
    },
    {
      title: "Спасибо за всё 💝",
      text: "За твою улыбку, поддержку и любовь. Ты делаешь мою жизнь ярче всех звезд на небе.",
      action: null
    },
    {
      title: "Я люблю тебя 💖",
      text: "Сильнее, чем гравитация притягивает планеты. Ты - моя единственная и неповторимая.",
      action: null
    }
  ]

  const handleStart = () => {
    setShowStart(false)
  }

  const handlePhotoClick = (photoIndex) => {
    setSelectedPhoto(photoIndex)
  }

  const nextMessage = () => {
    if (messages[currentMessage].action) {
      messages[currentMessage].action()
    } else {
      setCurrentMessage((prev) => (prev + 1) % messages.length)
    }
  }

  return (
    <>
      <div className="canvas-container">
        <Canvas camera={{ position: [0, 0, 8], fov: 60 }}>
          <SpaceScene photos={photos} onPhotoClick={handlePhotoClick} />
          <OrbitControls
            enableZoom={true}
            minDistance={5}
            maxDistance={15}
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.2}
          />
        </Canvas>
      </div>

      <div className="ui-overlay">
        <AnimatePresence mode="wait">
          {showStart ? (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="message-card"
            >
              <h2>Для самой лучшей Алтынай 💝</h2>
              <p>Я создал для тебя целую вселенную наших воспоминаний...</p>
              <p style={{ fontSize: '0.9rem', marginTop: '1rem', opacity: 0.8 }}>
                Приготовься к путешествию через космос нашей любви 🚀
              </p>
              <button className="planet-button" onClick={handleStart}>
                Начать путешествие ✨
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={currentMessage}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="message-card"
            >
              <h2>{messages[currentMessage].title}</h2>
              <p>{messages[currentMessage].text}</p>
              <button className="planet-button" onClick={nextMessage}>
                {messages[currentMessage].buttonText || 
                 (currentMessage === messages.length - 1 ? 'Начать сначала ♻️' : 'Дальше ✨')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!showStart && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="instructions"
          >
            Вращай космос и кликай на фото! 🌟
          </motion.p>
        )}
      </div>

      <PhotoGallery 
        isOpen={selectedPhoto !== null} 
        onClose={() => setSelectedPhoto(null)}
        photos={photos}
        initialPhoto={selectedPhoto || 0}
      />
    </>
  )
}

export default App
