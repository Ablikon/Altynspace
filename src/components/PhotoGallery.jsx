import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import '../styles/PhotoGallery.css'

export default function PhotoGallery({ isOpen, onClose, photos, initialPhoto = 0 }) {
  const [currentPhoto, setCurrentPhoto] = useState(initialPhoto)

  useEffect(() => {
    if (isOpen) {
      setCurrentPhoto(initialPhoto)
    }
  }, [isOpen, initialPhoto])

  const nextPhoto = () => {
    setCurrentPhoto((prev) => (prev + 1) % photos.length)
  }

  const prevPhoto = () => {
    setCurrentPhoto((prev) => (prev - 1 + photos.length) % photos.length)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        className="gallery-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="gallery-container"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="photo-counter">
            {currentPhoto + 1} / {photos.length}
          </div>
          <button className="gallery-close" onClick={onClose}>✕</button>
          
          <div className="gallery-content">
            <button className="gallery-nav gallery-prev" onClick={prevPhoto}>
              ‹
            </button>
            
            <div className="photo-container">
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentPhoto}
                  src={photos[currentPhoto].src}
                  alt={photos[currentPhoto].caption}
                  className="gallery-photo"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.3 }}
                />
              </AnimatePresence>
              
              <motion.p
                key={`caption-${currentPhoto}`}
                className="photo-caption"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {photos[currentPhoto].caption}
              </motion.p>
            </div>
            
            <button className="gallery-nav gallery-next" onClick={nextPhoto}>
              ›
            </button>
          </div>
          
          <div className="gallery-dots">
            {photos.map((_, index) => (
              <button
                key={index}
                className={`gallery-dot ${index === currentPhoto ? 'active' : ''}`}
                onClick={() => setCurrentPhoto(index)}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
