"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Images } from "lucide-react";

export default function JobPhotoGallery({ photos }: { photos: string[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!photos.length) return null;

  function close() {
    setActiveIndex(null);
  }

  function previous() {
    setActiveIndex((current) => current === null ? null : (current - 1 + photos.length) % photos.length);
  }

  function next() {
    setActiveIndex((current) => current === null ? null : (current + 1) % photos.length);
  }

  return <>
    <section className="job-photo-section" aria-label="Customer job photos">
      <div className="job-photo-heading"><span><Images size={15}/> Customer photos</span><small>{photos.length} {photos.length === 1 ? "photo" : "photos"}</small></div>
      <div className="job-photo-tiles">
        {photos.map((photoUrl, index) => <button
          type="button"
          className="job-photo-tile"
          key={photoUrl}
          onClick={() => setActiveIndex(index)}
          aria-label={`Open customer photo ${index + 1}`}
        >
          <img src={photoUrl} alt={`Customer job photo ${index + 1}`} loading="lazy" />
          <span>View</span>
        </button>)}
      </div>
    </section>
    {activeIndex !== null && <div className="job-photo-lightbox" role="dialog" aria-modal="true" aria-label="Customer photo viewer" onClick={close}>
      <button type="button" className="job-photo-close" onClick={close} aria-label="Close photo viewer"><X size={22}/></button>
      {photos.length > 1 && <button type="button" className="job-photo-nav job-photo-prev" onClick={(event) => { event.stopPropagation(); previous(); }} aria-label="Previous photo"><ChevronLeft size={28}/></button>}
      <img className="job-photo-expanded" src={photos[activeIndex]} alt={`Customer job photo ${activeIndex + 1} of ${photos.length}`} onClick={(event) => event.stopPropagation()} />
      {photos.length > 1 && <button type="button" className="job-photo-nav job-photo-next" onClick={(event) => { event.stopPropagation(); next(); }} aria-label="Next photo"><ChevronRight size={28}/></button>}
      <div className="job-photo-counter">{activeIndex + 1} / {photos.length}</div>
    </div>}
  </>;
}
